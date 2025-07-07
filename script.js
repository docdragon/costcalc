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
const cuttingLayoutContainer = document.getElementById('cutting-layout-container');
const cuttingLayoutSummary = document.getElementById('cutting-layout-summary');

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

    pieces.push({ name: 'Hông Trái', width: width, height: height });
    pieces.push({ name: 'Hông Phải', width: width, height: height });
    pieces.push({ name: 'Đáy', width: length, height: width });
    
    if (type !== 'tu-bep-duoi') {
        pieces.push({ name: 'Nóc', width: length, height: width });
    }
    if (type.includes('tu-')) {
         pieces.push({ name: 'Cánh Trái', width: Math.round(length / 2), height: height });
         pieces.push({ name: 'Cánh Phải', width: Math.round(length / 2), height: height });
    }
    if (usesMainWoodForBack && type !== 'tu-ao' && type !== 'khac') {
        pieces.push({ name: 'Hậu', width: length, height: height });
    }

    return pieces.filter(p => p.width > 0 && p.height > 0).map(p => ({...p, width: Math.round(p.width), height: Math.round(p.height)}));
}

function renderCuttingLayout(layoutData) {
    if (!layoutData || !layoutData.sheets || layoutData.totalSheetsUsed === 0) {
        cuttingLayoutSummary.innerHTML = `<p>AI không thể tạo sơ đồ cắt ván tối ưu từ thông tin được cung cấp.</p>`;
        cuttingLayoutSection.classList.remove('hidden');
        cuttingLayoutContainer.innerHTML = '';
        return;
    }

    cuttingLayoutContainer.innerHTML = '';
    const totalSheets = layoutData.totalSheetsUsed;
    cuttingLayoutSummary.innerHTML = `<p><strong>Kết quả tối ưu:</strong> Cần dùng <strong>${totalSheets}</strong> tấm ván chính (kích thước 1220 x 2440mm) để hoàn thành sản phẩm này.</p>`;

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
        cuttingLayoutContainer.appendChild(wrapper);
    });

    cuttingLayoutSection.classList.remove('hidden');
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

function renderFormattedText(text) {
    const sections = text.split(/(\*\*.*?\*\*)/g); // Split by bold markdown
    return sections.map(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const strong = document.createElement('strong');
            strong.textContent = part.slice(2, -2);
            return strong.outerHTML;
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
    addedAccessories = [];
    renderAccessories();
    lastGeminiResult = null;
    document.querySelector('#remove-image-btn').click();

    // Reset result areas
    resultContainer.innerHTML = '<p>Kết quả phân tích từ AI sẽ xuất hiện ở đây sau khi bạn nhấn nút.</p>';
    costBreakdownContainer.innerHTML = '';
    costBreakdownContainer.classList.add('hidden');
    priceSummaryContainer.classList.add('hidden');
    cuttingLayoutSection.classList.add('hidden');
    cuttingLayoutContainer.innerHTML = '';
    cuttingLayoutSummary.innerHTML = '';
    saveItemBtn.disabled = true;
}

// --- AI Calculation Logic ---
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
    
    // Show loading state
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;
    resultContainer.innerHTML = '<div class="flex justify-center items-center h-full"><div class="spinner"></div></div>';
    priceSummaryContainer.classList.add('hidden');
    costBreakdownContainer.classList.add('hidden');
    cuttingLayoutSection.classList.add('hidden');

    const inputs = {
        name: itemName,
        length: document.getElementById('item-length').value,
        width: document.getElementById('item-width').value,
        height: document.getElementById('item-height').value,
        type: document.getElementById('item-type').value,
        description: document.getElementById('product-description').value,
        profitMargin: document.getElementById('profit-margin').value,
    };

    const mainWoodId = document.getElementById('material-wood').value;
    const backPanelId = document.getElementById('material-back-panel').value;
    const edgeId = document.getElementById('material-edge').value;
    
    const mainWood = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const backPanel = localMaterials['Ván'].find(m => m.id === backPanelId);
    const edge = localMaterials['Cạnh'].find(m => m.id === edgeId);

    if (!mainWood || !edge) {
        showToast('Vui lòng chọn vật liệu Ván chính và Nẹp cạnh.', 'error');
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = '<i class="fas fa-cogs"></i> Nhờ AI Phân tích';
        return;
    }

    const panelPieces = getPanelPieces();
    
    const prompt = `
    TASK: You are an expert AI assistant for a woodworking shop in Vietnam. Your goal is to provide a detailed cost analysis, optimization suggestions, and a precise cutting layout (2D bin packing) for a given product.

    RESPONSE FORMAT: You MUST respond with a single JSON object. Do not include any text, notes, or markdown fences like \`\`\`json\`\`\` outside of the JSON object. The JSON object must have the following structure:
    {
      "costBreakdown": {
        "materialCosts": [
          { "name": "Ván chính MDF An Cường", "cost": 1100000, "reason": "Cần 2 tấm" },
          { "name": "Ván hậu Plywood", "cost": 250000, "reason": "Cần 1 tấm" },
          { "name": "Nẹp cạnh PVC", "cost": 150000, "reason": "Ước tính 30 mét" },
          { "name": "Phụ kiện (Bản lề, ray...)", "cost": 270000, "reason": "Tổng hợp từ danh sách" }
        ],
        "hiddenCosts": [
          { "name": "Hao hụt vật tư & Cắt lỗi", "cost": 150000, "reason": "Dựa trên độ phức tạp của sản phẩm" },
          { "name": "Nhân công sản xuất", "cost": 800000, "reason": "Ước tính 2 ngày công" },
          { "name": "Vận chuyển & Lắp đặt", "cost": 300000, "reason": "Áp dụng cho sản phẩm lớn" }
        ],
        "totalCost": 3020000,
        "suggestedPrice": 4530000,
        "estimatedProfit": 1510000
      },
      "aiSuggestions": "Your text analysis and suggestions here. Be helpful, professional, and address the user directly. Provide optimization ideas, potential issues, and upsell opportunities. Format with markdown bolding (**text**).",
      "cuttingLayout": {
        "totalSheetsUsed": 2,
        "sheets": [
          {
            "sheetNumber": 1,
            "pieces": [
              { "name": "Hông Trái", "x": 0, "y": 0, "width": 600, "height": 750 },
              { "name": "Hông Phải", "x": 600, "y": 0, "width": 600, "height": 750 }
            ]
          }
        ]
      }
    }

    INPUT DATA:
    - Product Name: ${inputs.name}
    - Dimensions (LxWxH): ${inputs.length} x ${inputs.width} x ${inputs.height} mm
    - Product Type: ${inputs.type}
    - User Notes: ${inputs.description}
    - Desired Profit Margin: ${inputs.profitMargin}%
    - Main Wood: ${mainWood.name} (${mainWood.price} VND/${mainWood.unit})
    - Back Panel Wood: ${backPanel ? `${backPanel.name} (${backPanel.price} VND/${backPanel.unit})` : 'Use main wood'}
    - Edge Banding: ${edge.name} (${edge.price} VND/mét)
    - Accessories: ${addedAccessories.map(a => `${a.name} (SL: ${a.quantity}, Đơn giá: ${a.price})`).join(', ')}
    - Image provided: ${uploadedImage ? 'Yes' : 'No'}

    INSTRUCTIONS:
    1.  **Cutting Layout (Bin Packing):**
        - The standard panel size is 1220mm x 2440mm.
        - The list of pieces to be cut from the MAIN WOOD is: ${JSON.stringify(panelPieces)}.
        - Perform a 2D bin packing algorithm to fit these pieces onto the minimum number of standard panels.
        - The (x, y) coordinates should be the top-left corner of each piece on the panel.
        - Populate the "cuttingLayout" object in the JSON response with the results. Set "totalSheetsUsed" to the total number of main wood panels needed. This is the MOST important calculation.
    2.  **Cost Calculation:**
        - Calculate the cost of the main wood based on the exact "totalSheetsUsed" from your cutting layout, not an estimate.
        - If a separate back panel is specified, assume 1 panel is needed. If not, the back panel pieces are included in the main wood cutting list.
        - Estimate the total length of edge banding required.
        - Sum the cost of all specified accessories.
        - Calculate "hiddenCosts" like labor, transport, and waste based on product size, complexity, and the provided image if available. Be realistic.
        - Sum all costs to get "totalCost".
        - Calculate "suggestedPrice" by applying the user's desired profit margin to the "totalCost".
        - Calculate "estimatedProfit" as suggestedPrice - totalCost.
    3.  **AI Suggestions:**
        - Write a friendly and professional analysis in the "aiSuggestions" field.
        - If an image was provided, mention that you've analyzed it.
        - Offer suggestions for material savings, structural improvements, or alternative accessories.
    `;
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt, image: uploadedImage })
        });
        
        const data = await response.json();

        if (!response.ok) {
            // Specific check for overload error from our API
            if (data.error && (data.error.includes('overloaded') || data.error.includes('UNAVAILABLE') || data.error.includes('503'))) {
                showToast('AI đang quá tải, vui lòng thử lại sau giây lát.', 'info');
            } else {
                 throw new Error(data.error || `Lỗi máy chủ: ${response.status}`);
            }
            return;
        }

        lastGeminiResult = data;
        
        const { costBreakdown, aiSuggestions, cuttingLayout } = data;

        // Render results
        if (costBreakdown) {
            const allCosts = [
                ...(costBreakdown.materialCosts || []),
                ...(costBreakdown.hiddenCosts || [])
            ];
            renderCostBreakdown(allCosts, costBreakdownContainer);
            
            totalCostValue.textContent = (costBreakdown.totalCost || 0).toLocaleString('vi-VN') + 'đ';
            suggestedPriceValue.textContent = (costBreakdown.suggestedPrice || 0).toLocaleString('vi-VN') + 'đ';
            estimatedProfitValue.textContent = (costBreakdown.estimatedProfit || 0).toLocaleString('vi-VN') + 'đ';
            priceSummaryContainer.classList.remove('hidden');
        }

        resultContainer.innerHTML = renderFormattedText(aiSuggestions || 'Không có gợi ý nào từ AI.');
        
        if (cuttingLayout) {
            renderCuttingLayout(cuttingLayout);
        }

        saveItemBtn.disabled = false;

    } catch (error) {
        console.error("Error calling AI:", error);
        // This is a fallback for network errors, but the check above handles API errors more gracefully.
        if (error.message.includes('503') || error.message.includes('overloaded')) {
             showToast('AI đang quá tải, vui lòng thử lại sau giây lát.', 'info');
        } else {
             showToast(`Lỗi khi phân tích: ${error.message}`, 'error');
        }
        resultContainer.innerHTML = `<p style="color: var(--danger-color);">Đã xảy ra lỗi khi giao tiếp với AI. Vui lòng thử lại.</p>`;
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = '<i class="fas fa-cogs"></i> Nhờ AI Phân tích';
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
    items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.inputs.name || 'Dự án không tên'}</td>
            <td>${new Date(item.createdAt.toDate()).toLocaleString('vi-VN')}</td>
            <td class="text-center">
                <button class="view-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${item.id}"><i class="fas fa-eye"></i></button>
                <button class="delete-saved-item-btn text-red-500 hover:text-red-700" data-id="${item.id}"><i class="fas fa-trash"></i></button>
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

    if (viewBtn) {
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
 * Renders the details of a saved item to a modal.
 * This function is now robust and handles potentially missing data from older saved items.
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

    const mainWood = localMaterials['Ván'].find(m => m.id === inputs.mainWoodId)?.name || 'Không rõ';
    const backPanel = localMaterials['Ván'].find(m => m.id === inputs.backPanelId)?.name || 'Dùng ván chính';
    const edge = localMaterials['Cạnh'].find(m => m.id === inputs.edgeId)?.name || 'Không rõ';

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
        // Create a temporary div to use the render function
        const tempContainer = document.createElement('div');
        renderCostBreakdown(allCosts, tempContainer);
        breakdownHtml = tempContainer.innerHTML;
    }
    
    let layoutHtml = '<p>Không có sơ đồ cắt ván.</p>';
    if (cuttingLayout.sheets) {
        const tempContainer = document.createElement('div');
        const tempSummary = document.createElement('div');
        // Temporarily re-assign globals for the render function
        const oldContainer = cuttingLayoutContainer;
        const oldSummary = cuttingLayoutSummary;
        cuttingLayoutContainer = tempContainer;
        cuttingLayoutSummary = tempSummary;
        renderCuttingLayout(cuttingLayout);
        layoutHtml = tempSummary.outerHTML + tempContainer.innerHTML;
        // Restore globals
        cuttingLayoutContainer = oldContainer;
        cuttingLayoutSummary = oldSummary;
    }

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
            <li><strong>Ván hậu:</strong> ${backPanel}</li>
            <li><strong>Nẹp cạnh:</strong> ${edge}</li>
            <li><strong>Phụ kiện:</strong> ${accessoriesHtml}</li>
        </ul>
        
        <h4><i class="fas fa-file-invoice-dollar"></i>Phân tích Chi phí Chi tiết</h4>
        ${breakdownHtml}

        <h4><i class="fas fa-lightbulb"></i>Gợi ý từ AI</h4>
        <div class="result-content-inner" style="min-height: auto;">
           ${renderFormattedText(item.aiSuggestions || 'Không có gợi ý.')}
        </div>
        
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
        parts: [{ text: "You are a helpful AI assistant for woodworking cost estimation. Keep your answers concise and relevant to furniture making in Vietnam. The user is likely asking for advice on materials, pricing, or production techniques. All conversations are persisted." }],
    }];
    renderChatMessage('Chào bạn, tôi là trợ lý AI. Tôi có thể giúp gì cho việc tính giá sản phẩm của bạn?', 'model');
}

function renderChatMessage(message, role) {
    if (isAwaitingChatResponse && role === 'model') {
        const placeholder = chatMessagesContainer.querySelector('.typing-indicator-wrapper');
        if (placeholder) placeholder.remove();
    }
    
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

    // Add typing indicator
    const typingIndicatorWrapper = document.createElement('div');
    typingIndicatorWrapper.className = 'chat-message model typing-indicator-wrapper';
    typingIndicatorWrapper.innerHTML = `
        <div class="icon"><i class="fas fa-robot"></i></div>
        <div class="message-content typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    chatMessagesContainer.appendChild(typingIndicatorWrapper);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newChatMessage: true, chatHistory: chatHistory })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi không xác định');
        }
        
        const aiResponse = data.text;
        renderChatMessage(aiResponse, 'model');
        chatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
        
    } catch (error) {
        console.error("Chat error:", error);
        renderChatMessage(`Xin lỗi, tôi gặp sự cố: ${error.message}`, 'model');
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
