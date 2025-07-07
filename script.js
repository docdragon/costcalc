// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut 
} from './firebase.js';

import { 
    openModal, showConfirm, showToast, updateUIVisibility, 
    initializeImageUploader, initializeTabs, initializeModals 
} from './ui.js';

// --- DOM Elements (Feature-specific) ---
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
let currentCalculation = { breakdown: [], totalCost: 0 };


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
    chatMessagesContainer.innerHTML = '';
    renderMaterials([]);
    renderSavedItems([]);
    populateSelects();
    updateClientSideCosts();
}

logoutBtn.addEventListener('click', () => signOut(auth));


// --- AI Calculation Helper Functions ---

function getPanelPieces() {
    const length = parseFloat(document.getElementById('item-length').value) || 0;
    const width = parseFloat(document.getElementById('item-width').value) || 0;
    const height = parseFloat(document.getElementById('item-height').value) || 0;
    const type = document.getElementById('item-type').value;
    const backPanelSelect = document.getElementById('material-back-panel');
    const usesMainWoodForBack = !backPanelSelect.value || backPanelSelect.value === 'none';

    const pieces = [];

    if (!length || !width || !height) return [];

    // Thùng
    pieces.push({ name: 'Hông Trái', width: width, height: height });
    pieces.push({ name: 'Hông Phải', width: width, height: height });
    pieces.push({ name: 'Đáy', width: length, height: width });
    
    // Nóc: Hầu hết các loại tủ đều có nóc, trừ tủ bếp dưới (thường là mặt đá)
    if (type !== 'tu-bep-duoi') {
        pieces.push({ name: 'Nóc', width: length, height: width });
    }

    // Cánh tủ, giả định 2 cánh cho các loại tủ (trừ hộp 'khac')
    if (type.includes('tu-')) {
         pieces.push({ name: 'Cánh Trái', width: Math.round(length / 2), height: height });
         pieces.push({ name: 'Cánh Phải', width: Math.round(length / 2), height: height });
    }
    
    // Hậu tủ, chỉ tính vào ván chính nếu không có hậu riêng và không phải loại không có hậu
    if (usesMainWoodForBack && type !== 'tu-ao' && type !== 'khac') {
        pieces.push({ name: 'Hậu', width: length, height: height });
    }

    return pieces.filter(p => p.width > 0 && p.height > 0).map(p => ({...p, width: Math.round(p.width), height: Math.round(p.height)}));
}


function renderCuttingLayout(layoutData) {
    if (!layoutData || !layoutData.sheets || layoutData.totalSheetsUsed === 0) {
        cuttingLayoutSummary.innerHTML = `<p>AI không thể tạo sơ đồ cắt ván tối ưu từ thông tin được cung cấp.</p>`;
        cuttingLayoutSection.classList.remove('hidden');
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
            
            const w = piece.width;
            const h = piece.height;
            
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

function renderCostBreakdown(breakdown) {
    let breakdownHtml = '<ul class="cost-list">';
    breakdown.forEach(item => {
        breakdownHtml += `
            <li>
                <span class="cost-item-name">${item.name}</span>
                <span class="cost-item-value">${item.cost.toLocaleString('vi-VN')}đ</span>
                ${item.reason ? `<p class="cost-item-reason">${item.reason}</p>` : ''}
            </li>
        `;
    });
    breakdownHtml += '</ul>';
    costBreakdownContainer.innerHTML = breakdownHtml;
    costBreakdownContainer.classList.remove('hidden');
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
        materialsTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-gray-400">Chưa có vật tư nào. Bắt đầu bằng cách thêm vật tư ở trên.</td></tr>`;
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
        s.el.value = currentVal;
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
        } else {
            e.target.value = accessory.quantity; // revert if invalid
        }
    }
});

// --- Main Calculation Logic ---
function updateClientSideCosts() {
    const length = parseFloat(document.getElementById('item-length').value) || 0;
    const width = parseFloat(document.getElementById('item-width').value) || 0;
    const height = parseFloat(document.getElementById('item-height').value) || 0;
    const breakdown = [];
    let totalCost = 0;

    // Ván chính
    const woodMaterialId = document.getElementById('material-wood').value;
    const woodMaterial = localMaterials['Ván'].find(m => m.id === woodMaterialId);
    if (woodMaterial) {
        const woodArea = (length * width * 2 + length * height * 2 + width * height * 2) / 1000000;
        const cost = woodArea * woodMaterial.price / 2.9768 * 1.3; // 1220x2440mm, hao hụt 30%
        breakdown.push({ id: 'main-wood', name: `Ván chính (Ước tính)`, cost });
        totalCost += cost;
    }

    // Ván hậu
    const backPanelId = document.getElementById('material-back-panel').value;
    const backPanelMaterial = localMaterials['Ván'].find(m => m.id === backPanelId);
    if (backPanelMaterial) {
        const backArea = (length * height) / 1000000;
        const cost = backArea * backPanelMaterial.price / 2.9768 * 1.1; // hao hụt 10%
        breakdown.push({ name: 'Ván hậu', cost });
        totalCost += cost;
    }

    // Nẹp cạnh
    const edgeMaterialId = document.getElementById('material-edge').value;
    const edgeMaterial = localMaterials['Cạnh'].find(m => m.id === edgeMaterialId);
    if (edgeMaterial) {
        const edgeLength = (length * 4 + width * 4 + height * 4) / 1000;
        const cost = edgeLength * edgeMaterial.price;
        breakdown.push({ name: 'Nẹp cạnh', cost });
        totalCost += cost;
    }
    
    // Phụ kiện
    addedAccessories.forEach(acc => {
        const cost = acc.price * acc.quantity;
        breakdown.push({ name: `${acc.name} (x${acc.quantity})`, cost });
        totalCost += cost;
    });

    currentCalculation = {
        breakdown: breakdown.map(item => ({...item, cost: Math.round(item.cost)})),
        totalCost: Math.round(totalCost)
    };
    return currentCalculation;
}


function updatePriceSummary(totalCost) {
    const profitMargin = parseFloat(document.getElementById('profit-margin').value) / 100 || 0.5;
    const suggestedPrice = totalCost / (1 - profitMargin);
    const estimatedProfit = suggestedPrice - totalCost;

    totalCostValue.textContent = `${Math.round(totalCost).toLocaleString('vi-VN')}đ`;
    suggestedPriceValue.textContent = `${Math.round(suggestedPrice).toLocaleString('vi-VN')}đ`;
    estimatedProfitValue.textContent = `${Math.round(estimatedProfit).toLocaleString('vi-VN')}đ`;
    priceSummaryContainer.classList.remove('hidden');
}

function showLoadingState(isLoading) {
    if (isLoading) {
        calculateBtn.disabled = true;
        calculateBtn.innerHTML = '<div class="spinner-sm"></div> Đang phân tích...';
        resultContainer.innerHTML = '<p>Trợ lý AI đang phân tích, vui lòng chờ trong giây lát...</p>';
        costBreakdownContainer.classList.add('hidden');
        cuttingLayoutSection.classList.add('hidden');
        priceSummaryContainer.classList.add('hidden');
    } else {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = '<i class="fas fa-cogs"></i> Nhờ AI Phân tích';
    }
}

calculateBtn.addEventListener('click', async () => {
    const itemName = document.getElementById('item-name').value || 'Sản phẩm chưa đặt tên';
    const length = document.getElementById('item-length').value;
    const width = document.getElementById('item-width').value;
    const height = document.getElementById('item-height').value;
    const itemType = document.getElementById('item-type').options[document.getElementById('item-type').selectedIndex].text;
    const description = document.getElementById('product-description').value;

    if (!length || !width || !height) {
        showToast('Vui lòng nhập đủ kích thước sản phẩm.', 'error');
        return;
    }

    showLoadingState(true);
    updateClientSideCosts(); // Calculate preliminary costs to send to AI

    const panelPieces = getPanelPieces();
    const piecesJSON = JSON.stringify(panelPieces, null, 2);

    const prompt = `BẠN LÀ MỘT TRỢ LÝ AI CHUYÊN GIA TÍNH TOÁN GIÁ THÀNH VÀ TỐI ƯU SẢN XUẤT NỘI THẤT.
Dựa trên thông tin sản phẩm và danh sách vật tư, hãy thực hiện các nhiệm vụ sau:

NHIỆM VỤ 1: TÍNH TOÁN CHI PHÍ ẨN
Phân tích các chi phí có thể bị bỏ sót như: nhân công, quản lý, thiết kế, vận chuyển, lắp đặt, khấu hao máy móc. Trình bày dưới dạng danh sách JSON.

NHIỆM VỤ 2: TỐI ƯU HÓA CẮT VÁN (2D BIN PACKING)
Sắp xếp các chi tiết (pieces) sau đây vào các tấm ván 1220mm x 2440mm một cách hiệu quả nhất. Các chi tiết CÓ THỂ XOAY 90 độ. Trả về số tấm ván cần dùng và toạ độ các chi tiết.

NHIỆM VỤ 3: GỢI Ý & TƯ VẤN
Đưa ra các đề xuất để tối ưu hóa chi phí hoặc cải thiện sản phẩm.

YÊU CẦU ĐỊNH DẠNG ĐẦU RA:
BẮT BUỘC trả lời bằng một đối tượng JSON DUY NHẤT, không có văn bản nào khác. Cấu trúc JSON phải như sau:
{
  "hiddenCosts": [ { "name": "string", "cost": number, "reason": "string" } ],
  "recommendations": "string",
  "cuttingLayout": {
    "totalSheetsUsed": number,
    "sheets": [
      {
        "sheetNumber": number,
        "pieces": [ { "name": "string", "width": number, "height": number, "x": number, "y": number } ]
      }
    ]
  }
}

--- DỮ LIỆU ĐẦU VÀO ---

1. THÔNG TIN SẢN PHẨM:
Tên: ${itemName}
Kích thước (Dài x Rộng x Cao): ${length} x ${width} x ${height} mm
Loại: ${itemType}
Mô tả: ${description}
Chi phí vật tư sơ bộ (ước tính): ${currentCalculation.totalCost.toLocaleString('vi-VN')}đ
Chi tiết vật tư sơ bộ:
${currentCalculation.breakdown.map(item => `- ${item.name}: ${item.cost.toLocaleString('vi-VN')}đ`).join('\n')}

2. DANH SÁCH CHI TIẾT CẦN CẮT TỪ VÁN CHÍNH:
${piecesJSON}
`;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image: uploadedImage }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Lỗi không xác định từ máy chủ');
        }

        const parsedData = await response.json();
        lastGeminiResult = parsedData;

        // -- Start of new cost calculation flow --
        
        // 1. Update wood cost based on AI's cutting layout
        if (parsedData.cuttingLayout && parsedData.cuttingLayout.totalSheetsUsed > 0) {
            const mainWoodSelect = document.getElementById('material-wood');
            const selectedWoodId = mainWoodSelect.value;
            const mainWoodMaterial = localMaterials['Ván'].find(m => m.id === selectedWoodId);
            if (mainWoodMaterial) {
                const totalSheets = parsedData.cuttingLayout.totalSheetsUsed;
                const newMainWoodCost = totalSheets * mainWoodMaterial.price;
                const woodBreakdownItem = currentCalculation.breakdown.find(item => item.id === 'main-wood');
                if (woodBreakdownItem) {
                    woodBreakdownItem.cost = newMainWoodCost;
                    woodBreakdownItem.name = `Ván chính (${totalSheets} tấm)`;
                }
            }
        }
        
        // 2. Add hidden costs to the breakdown list
        if (parsedData.hiddenCosts) {
            parsedData.hiddenCosts.forEach(cost => {
                currentCalculation.breakdown.push({ name: cost.name, cost: cost.cost, reason: cost.reason });
            });
        }

        // 3. Recalculate final total cost from the updated breakdown
        const finalTotalCost = currentCalculation.breakdown.reduce((sum, item) => sum + item.cost, 0);
        currentCalculation.totalCost = finalTotalCost;

        // 4. Render all UI components with the final, accurate data
        updatePriceSummary(finalTotalCost);
        renderCostBreakdown(currentCalculation.breakdown);
        
        if (parsedData.recommendations) {
             resultContainer.innerHTML = `<h4><i class="fas fa-lightbulb"></i> Gợi ý & Tối ưu</h4><p>${parsedData.recommendations}</p>`;
        } else {
             resultContainer.innerHTML = `<p>AI không có gợi ý nào cho sản phẩm này.</p>`;
        }
       
        if (parsedData.cuttingLayout) {
             renderCuttingLayout(parsedData.cuttingLayout);
        }

        saveItemBtn.disabled = false;

    } catch (error) {
        console.error('Error calling AI:', error);
        resultContainer.innerHTML = `<p class="error-message">Lỗi: ${error.message}</p>`;
        showToast(`Lỗi khi gọi AI: ${error.message}`, 'error');
    } finally {
        showLoadingState(false);
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
        savedItemsTableBody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-gray-400">Chưa có dự án nào được lưu.</td></tr>`;
        return;
    }
    items.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.name}</td>
            <td>${item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('vi-VN') : 'Không rõ'}</td>
            <td class="text-center">
                <button class="view-btn text-green-500 hover:text-green-700 mr-2" data-id="${item.id}"><i class="fas fa-eye"></i></button>
                <button class="delete-saved-btn text-red-500 hover:text-red-700" data-id="${item.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        savedItemsTableBody.appendChild(tr);
    });
}

saveItemBtn.addEventListener('click', async () => {
    if (!currentUserId || !lastGeminiResult) return;
    const itemName = document.getElementById('item-name').value || 'Dự án chưa đặt tên';
    const itemToSave = {
        name: itemName,
        inputs: {
            length: document.getElementById('item-length').value,
            width: document.getElementById('item-width').value,
            height: document.getElementById('item-height').value,
            type: document.getElementById('item-type').value,
            description: document.getElementById('product-description').value,
            profitMargin: document.getElementById('profit-margin').value,
            materials: {
                wood: document.getElementById('material-wood').value,
                backPanel: document.getElementById('material-back-panel').value,
                edge: document.getElementById('material-edge').value,
            },
            accessories: addedAccessories
        },
        result: lastGeminiResult,
        costBreakdown: currentCalculation,
        createdAt: serverTimestamp()
    };
    try {
        await addDoc(savedItemsCollectionRef, itemToSave);
        showToast('Lưu dự án thành công!', 'success');
    } catch (error) {
        showToast('Lỗi khi lưu dự án.', 'error');
        console.error("Error saving item:", error);
    }
});

savedItemsTableBody.addEventListener('click', async e => {
    const viewBtn = e.target.closest('.view-btn');
    const deleteBtn = e.target.closest('.delete-saved-btn');
    if (viewBtn) {
        const id = viewBtn.dataset.id;
        const item = localSavedItems.find(i => i.id === id);
        if (item) renderItemDetailsToModal(item);
    } else if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa dự án này?');
        if (confirmed) {
            await deleteDoc(doc(db, `users/${currentUserId}/savedItems`, id));
            showToast('Xóa dự án thành công.', 'success');
        }
    }
});

function renderItemDetailsToModal(item) {
    const titleEl = document.getElementById('view-item-title');
    const contentEl = document.getElementById('view-item-content');
    
    titleEl.textContent = `Chi tiết: ${item.name}`;

    const totalCost = item.costBreakdown.totalCost;
    const profitMargin = parseFloat(item.inputs.profitMargin) / 100 || 0.5;
    const suggestedPrice = totalCost / (1 - profitMargin);
    const profit = suggestedPrice - totalCost;

    let html = `
        <h4><i class="fas fa-ruler-combined"></i> Thông số & Yêu cầu</h4>
        <ul>
            <li><strong>Kích thước:</strong> ${item.inputs.length}x${item.inputs.width}x${item.inputs.height} mm</li>
            <li><strong>Mô tả:</strong> ${item.inputs.description || 'Không có'}</li>
            <li><strong>Lợi nhuận mong muốn:</strong> ${item.inputs.profitMargin}%</li>
        </ul>
        
        <div class="final-price-recommendation">
            <div class="final-price-label">Giá Bán Đề Xuất</div>
            <div class="final-price-value">${Math.round(suggestedPrice).toLocaleString('vi-VN')}đ</div>
            <p class="final-price-summary">Tổng chi phí vật tư & chi phí ẩn: ${totalCost.toLocaleString('vi-VN')}đ • Lợi nhuận ước tính: ${Math.round(profit).toLocaleString('vi-VN')}đ</p>
        </div>

        <h4><i class="fas fa-list-alt"></i> Bảng Kê Chi Phí Chi Tiết</h4>
    `;
    
    let breakdownHtml = '<ul class="cost-list">';
    item.costBreakdown.breakdown.forEach(b => {
        breakdownHtml += `<li><span class="cost-item-name">${b.name}</span> <span class="cost-item-value">${b.cost.toLocaleString('vi-VN')}đ</span></li>`;
    });
    breakdownHtml += '</ul>';
    html += breakdownHtml;

    if (item.result.recommendations) {
        html += `<h4><i class="fas fa-lightbulb"></i> Gợi ý từ AI</h4><p>${item.result.recommendations}</p>`;
    }
    
    contentEl.innerHTML = html;
    openModal(viewItemModal);
}

// --- AI Chat Assistant ---
function initializeChat() {
    chatHistory = [
        { role: 'user', parts: [{ text: 'CONTEXT: Tôi là chủ một xưởng mộc. Bạn là trợ lý AI chuyên gia về tính giá và tư vấn sản xuất nội thất. Hãy ghi nhớ các cuộc trò chuyện của chúng ta để áp dụng vào các lần tính giá sau này. Bắt đầu cuộc trò chuyện một cách thân thiện.' }] },
        { role: 'model', parts: [{ text: 'Chào bạn! Tôi là trợ lý AI, sẵn sàng giúp bạn tính toán giá thành và tối ưu hóa sản xuất. Hãy bắt đầu bằng cách cho tôi biết bạn cần gì nhé!' }] }
    ];
    renderChatHistory();
}

function renderChatHistory() {
    chatMessagesContainer.innerHTML = '';
    chatHistory.slice(1).forEach(msg => appendChatMessage(msg.role, msg.parts[0].text));
}

function appendChatMessage(role, text, isTyping = false) {
    const messageEl = document.createElement('div');
    messageEl.classList.add('chat-message', role);
    
    const iconClass = role === 'user' ? 'fa-user' : 'fa-robot';
    const content = isTyping 
        ? `<div class="typing-indicator"><span></span><span></span><span></span></div>`
        : text.replace(/\n/g, '<br>');

    messageEl.innerHTML = `
        <div class="icon"><i class="fas ${iconClass}"></i></div>
        <div class="message-content">${content}</div>
    `;
    chatMessagesContainer.appendChild(messageEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

chatForm.addEventListener('submit', async e => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message || isAwaitingChatResponse) return;

    chatInput.value = '';
    isAwaitingChatResponse = true;
    sendChatBtn.disabled = true;

    appendChatMessage('user', message);
    chatHistory.push({ role: 'user', parts: [{ text: message }] });
    appendChatMessage('model', '', true);

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatHistory: chatHistory, newChatMessage: true }),
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        document.querySelector('.chat-message.model:last-child').remove();
        appendChatMessage('model', data.text);
        chatHistory.push({ role: 'model', parts: [{ text: data.text }] });

    } catch (error) {
        console.error('Chat error:', error);
        document.querySelector('.chat-message.model:last-child').remove();
        appendChatMessage('model', 'Xin lỗi, tôi đang gặp sự cố. Vui lòng thử lại sau.');
    } finally {
        isAwaitingChatResponse = false;
        sendChatBtn.disabled = false;
    }
});


// --- Image Upload Initialization ---
initializeImageUploader(
    (imageData) => uploadedImage = imageData, 
    () => uploadedImage = null
);
initializeTabs();
initializeModals();
