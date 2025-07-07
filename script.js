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
        showToast('Đã có lỗi xảy ra.', 'error');
        console.error("Error saving material: ", error); 
    }
});

materialsTableBody.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!currentUserId || !btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-btn')) {
        if (await showConfirm('Bạn có chắc chắn muốn xóa vật tư này? Hành động này không thể hoàn tác.')) {
            await deleteDoc(doc(db, `users/${currentUserId}/materials`, id));
            showToast('Đã xóa vật tư.', 'info');
        }
    } else if (btn.classList.contains('edit-btn')) {
        const allMaterials = Object.values(localMaterials).flat();
        const material = allMaterials.find(m => m.id === id);
        if (material) {
            materialForm['material-id'].value = material.id;
            materialForm['material-name'].value = material.name;
            materialForm['material-type'].value = material.type;
            materialForm['material-price'].value = material.price;
            materialForm['material-unit'].value = material.unit;
            materialForm['material-notes'].value = material.notes;
            materialForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save mr-2"></i> Cập nhật';
            document.getElementById('cancel-edit-button').classList.remove('hidden');
        }
    }
});

function resetMaterialForm() {
    materialForm.reset();
    materialForm['material-id'].value = '';
    materialForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Vật tư';
    document.getElementById('cancel-edit-button').classList.add('hidden');
}
document.getElementById('cancel-edit-button').addEventListener('click', resetMaterialForm);


// --- Calculator Tab Logic ---
function populateSelects() {
    const selects = { 
        'material-wood': 'Ván', 
        'material-edge': 'Cạnh', 
        'material-accessories': 'Phụ kiện',
        'material-back-panel': 'Ván'
    };

    for (const [selectId, type] of Object.entries(selects)) {
        const selectEl = document.getElementById(selectId);
        if (!selectEl) continue;
        const currentValue = selectEl.value;
        if (selectId === 'material-back-panel') {
            selectEl.innerHTML = '<option value="">-- Dùng chung ván chính --</option>';
        } else {
            selectEl.innerHTML = '<option value="">-- Chọn --</option>';
        }
        localMaterials[type].forEach(m => { selectEl.innerHTML += `<option value="${m.id}">${m.name}</option>`; });
        selectEl.value = currentValue;
    }
}

addAccessoryBtn.addEventListener('click', () => {
    const accessorySelect = document.getElementById('material-accessories');
    const quantityInput = document.getElementById('accessory-quantity');
    const selectedId = accessorySelect.value;
    const quantity = parseInt(quantityInput.value) || 1;
    if (!selectedId) return;

    const accessory = localMaterials['Phụ kiện'].find(a => a.id === selectedId);
    if (accessory) {
        const existingAccessory = addedAccessories.find(a => a.id === selectedId);
        if(existingAccessory){
            existingAccessory.quantity += quantity;
        } else {
            addedAccessories.push({ ...accessory, quantity });
        }
        renderAddedAccessories();
        updateClientSideCosts();
        quantityInput.value = 1;
        accessorySelect.value = '';
    }
});

function renderAddedAccessories() {
    accessoriesList.innerHTML = '';
    addedAccessories.forEach((acc, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="flex-grow">${acc.name}</span>
            <input type="number" class="input-style accessory-list-qty" value="${acc.quantity}" min="1" data-index="${index}">
            <span class="accessory-unit">${acc.unit}</span>
            <button data-index="${index}" class="remove-acc-btn text-red-400 hover:text-red-600">&times;</button>
        `;
        accessoriesList.appendChild(li);
    });
}

accessoriesList.addEventListener('input', e => {
    if (e.target.classList.contains('accessory-list-qty')) {
        const index = e.target.dataset.index;
        const newQuantity = parseInt(e.target.value, 10);
        if (addedAccessories[index] && newQuantity > 0) {
            addedAccessories[index].quantity = newQuantity;
            updateClientSideCosts();
        }
    }
});

accessoriesList.addEventListener('click', e => {
    if (e.target.classList.contains('remove-acc-btn')) {
        addedAccessories.splice(e.target.dataset.index, 1);
        renderAddedAccessories();
        updateClientSideCosts();
    }
});

function updateClientSideCosts() {
    const length = parseFloat(document.getElementById('item-length').value) || 0;
    const width = parseFloat(document.getElementById('item-width').value) || 0;
    const height = parseFloat(document.getElementById('item-height').value) || 0;
    const profitMargin = parseFloat(document.getElementById('profit-margin').value) || 0;
    const itemType = document.getElementById('item-type').value;

    const woodId = document.getElementById('material-wood').value;
    const edgeId = document.getElementById('material-edge').value;
    const backPanelId = document.getElementById('material-back-panel').value;
    const wood = localMaterials['Ván'].find(m => m.id === woodId);
    const edge = localMaterials['Cạnh'].find(m => m.id === edgeId);
    const backPanelWood = localMaterials['Ván'].find(m => m.id === backPanelId);

    let totalCost = 0;
    const breakdown = [];

    if (wood && length > 0 && width > 0 && height > 0) {
        let mainCarcassArea = 0;
        const backPanelArea = length * height; 

        switch (itemType) {
            case 'tu-bep-duoi':
                mainCarcassArea = (length * width) + (2 * width * height) + (length * height);
                break;
            case 'tu-bep-tren':
                mainCarcassArea = (2 * length * width) + (2 * width * height) + (length * height);
                break;
            case 'tu-ao':
                mainCarcassArea = 2 * (length * width) + 2 * (width * height) + (length * height);
                break;
            case 'khac':
            default:
                mainCarcassArea = (2 * length * width) + (2 * width * height);
                break;
        }

        const standardPanelArea = 1220 * 2440;
        const wasteFactor = 1.3;

        if (backPanelWood) {
            const mainPanelsNeeded = (mainCarcassArea / standardPanelArea) * wasteFactor;
            const mainWoodCost = mainPanelsNeeded * wood.price;
            if (mainWoodCost > 0) {
                breakdown.push({ item: wood.name, quantity: `${mainPanelsNeeded.toFixed(2)} tấm`, unitCost: wood.price, totalCost: mainWoodCost });
                totalCost += mainWoodCost;
            }
            const backPanelsNeeded = (backPanelArea / standardPanelArea) * wasteFactor;
            const backPanelCost = backPanelsNeeded * backPanelWood.price;
            if (backPanelCost > 0) {
                breakdown.push({ item: `${backPanelWood.name} (Hậu)`, quantity: `${backPanelsNeeded.toFixed(2)} tấm`, unitCost: backPanelWood.price, totalCost: backPanelCost });
                totalCost += backPanelCost;
            }
        } else {
            const totalWoodArea = mainCarcassArea + backPanelArea;
            const panelsNeeded = (totalWoodArea / standardPanelArea) * wasteFactor;
            const woodCost = panelsNeeded * wood.price;
            if (woodCost > 0) {
                breakdown.push({ item: wood.name, quantity: `${panelsNeeded.toFixed(2)} tấm`, unitCost: wood.price, totalCost: woodCost });
                totalCost += woodCost;
            }
        }
    }

    if (edge && length > 0 && width > 0 && height > 0) {
        const edgeLength = (4 * length) + (4 * width) + (4 * height);
        const edgeLengthMeters = edgeLength / 1000;
        const edgeCost = edgeLengthMeters * edge.price;
        if (edgeCost > 0) {
            breakdown.push({ item: edge.name, quantity: `${edgeLengthMeters.toFixed(2)} mét`, unitCost: edge.price, totalCost: edgeCost });
            totalCost += edgeCost;
        }
    }

    addedAccessories.forEach(acc => {
        const accCost = acc.quantity * acc.price;
        breakdown.push({ item: acc.name, quantity: `${acc.quantity} ${acc.unit}`, unitCost: acc.price, totalCost: accCost });
        totalCost += accCost;
    });

    currentCalculation = { breakdown, totalCost };
    renderCostBreakdown(breakdown);

    const suggestedPrice = totalCost * (1 + profitMargin / 100);
    const estimatedProfit = suggestedPrice - totalCost;

    if (totalCost > 0) {
        priceSummaryContainer.classList.remove('hidden');
        totalCostValue.textContent = `${Math.round(totalCost).toLocaleString('vi-VN')}đ`;
        suggestedPriceValue.textContent = `${Math.round(suggestedPrice).toLocaleString('vi-VN')}đ`;
        estimatedProfitValue.textContent = `${Math.round(estimatedProfit).toLocaleString('vi-VN')}đ`;
    } else {
        priceSummaryContainer.classList.add('hidden');
    }
    
    saveItemBtn.disabled = !lastGeminiResult;
}

const calculatorInputs = ['item-length', 'item-width', 'item-height', 'profit-margin'];
calculatorInputs.forEach(id => document.getElementById(id).addEventListener('input', updateClientSideCosts));
const calculatorSelects = ['material-wood', 'material-edge', 'item-type', 'material-back-panel'];
calculatorSelects.forEach(id => document.getElementById(id).addEventListener('change', updateClientSideCosts));


function renderCostBreakdown(breakdownData) {
    if (!breakdownData || breakdownData.length === 0) {
        costBreakdownContainer.innerHTML = ''; return;
    }
    let tableHTML = `
        <h3 class="result-box-header">Bảng Kê Chi Phí Vật Tư Tạm Tính</h3>
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr>
                    <th class="th-style">Hạng mục</th>
                    <th class="th-style text-center">Số lượng</th>
                    <th class="th-style text-right">Đơn giá</th>
                    <th class="th-style text-right">Thành tiền</th>
                </tr></thead>
                <tbody>`;
    breakdownData.forEach(item => {
        tableHTML += `
            <tr>
                <td>${item.item || 'N/A'}</td>
                <td class="text-center">${item.quantity || 'N/A'}</td>
                <td class="text-right">${Number(item.unitCost || 0).toLocaleString('vi-VN')}đ</td>
                <td class="text-right font-semibold">${Math.round(item.totalCost || 0).toLocaleString('vi-VN')}đ</td>
            </tr>`;
    });
    tableHTML += `</tbody></table></div>`;
    costBreakdownContainer.innerHTML = tableHTML;
}

function formatAnalysisToHtml(analysisData) {
    if (!analysisData) return '<p>Không có phân tích.</p>';

    if (!analysisData.finalPricingAnalysis && analysisData.summary) {
        let oldHtml = '';
        if (analysisData.keyObservations && analysisData.keyObservations.length > 0) { oldHtml += `<h4><i class="fas fa-search-dollar"></i> Điểm Lưu Ý Chính</h4><ul>${analysisData.keyObservations.map(item => `<li>${item}</li>`).join('')}</ul>`; }
        if (analysisData.hiddenCosts && analysisData.hiddenCosts.length > 0) { oldHtml += `<h4><i class="fas fa-file-invoice-dollar"></i> Chi Phí Ẩn Tiềm Tàng</h4><ul>${analysisData.hiddenCosts.map(item => `<li>${typeof item === 'string' ? item : item.item}</li>`).join('')}</ul>`; }
        if (analysisData.optimizationTips && analysisData.optimizationTips.length > 0) { oldHtml += `<h4><i class="fas fa-lightbulb"></i> Gợi Ý Tối Ưu Hóa</h4><ul>${analysisData.optimizationTips.map(item => `<li>${item}</li>`).join('')}</ul>`; }
        if (analysisData.summary) { oldHtml += `<h4><i class="fas fa-flag-checkered"></i> Tổng Kết</h4><p>${analysisData.summary}</p>`; }
        return oldHtml || '<p>Không thể hiển thị phân tích. Dữ liệu có định dạng không mong đợi.</p>';
    }

    let html = '';

    if (analysisData.finalPricingAnalysis) {
        html += `
            <div class="final-price-recommendation">
                <div class="final-price-label">Giá Bán Tham Khảo Tốt Nhất</div>
                <div class="final-price-value">${Number(analysisData.finalPricingAnalysis.suggestedMarketPrice || 0).toLocaleString('vi-VN')}đ</div>
                <p class="final-price-summary">${analysisData.finalPricingAnalysis.summary || 'Không có tóm tắt.'}</p>
            </div>
        `;
    }

    if (analysisData.hiddenCosts && analysisData.hiddenCosts.length > 0) {
        html += `<h4><i class="fas fa-file-invoice-dollar"></i> Chi Phí Ẩn (Ước tính bởi AI)</h4><ul class="cost-list">`;
        let totalHiddenCost = 0;
        analysisData.hiddenCosts.forEach(cost => {
            const costValue = Number(cost.estimatedCost || 0);
            totalHiddenCost += costValue;
            html += `
                <li>
                    <span class="cost-item-name">${cost.item}</span>
                    <span class="cost-item-value">${costValue.toLocaleString('vi-VN')}đ</span>
                    ${cost.reason ? `<span class="cost-item-reason">${cost.reason}</span>` : ''}
                </li>`;
        });
        html += `
            <li class="total-cost-item">
                <span class="cost-item-name">Tổng chi phí ẩn</span>
                <span class="cost-item-value">${totalHiddenCost.toLocaleString('vi-VN')}đ</span>
            </li>
        `;
        html += `</ul>`;
    }
    
    if (analysisData.keyObservations && analysisData.keyObservations.length > 0) {
        html += `<h4><i class="fas fa-search-dollar"></i> Điểm Lưu Ý Chính</h4><ul>`;
        analysisData.keyObservations.forEach(item => { html += `<li>${item}</li>`; });
        html += `</ul>`;
    }
    
    if (analysisData.optimizationTips && analysisData.optimizationTips.length > 0) {
        html += `<h4><i class="fas fa-lightbulb"></i> Gợi Ý Tối Ưu Hóa</h4><ul>`;
        analysisData.optimizationTips.forEach(item => { html += `<li>${item}</li>`; });
        html += `</ul>`;
    }
    
    return html || '<p>Không thể hiển thị phân tích. Dữ liệu có định dạng không mong đợi.</p>';
}


calculateBtn.addEventListener('click', async () => {
    if (!currentUserId) { showToast('Vui lòng đăng nhập để dùng chức năng này.', 'error'); return; }
    if (currentCalculation.totalCost <= 0) {
        showToast('Chưa có chi phí để phân tích. Vui lòng nhập thông tin sản phẩm.', 'error');
        return;
    }

    const itemName = document.getElementById('item-name').value || 'Sản phẩm chưa đặt tên';
    const dimensions = `Dài ${document.getElementById('item-length').value || 0}mm x Rộng ${document.getElementById('item-width').value || 0}mm x Cao ${document.getElementById('item-height').value || 0}mm`;
    const description = document.getElementById('product-description').value;
    const profitMargin = document.getElementById('profit-margin').value || 50;
    
    const breakdownText = currentCalculation.breakdown.map(item => 
        `- ${item.item}: ${item.quantity} @ ${item.unitCost.toLocaleString('vi-VN')}đ = ${Math.round(item.totalCost).toLocaleString('vi-VN')}đ`
    ).join('\n');
    const suggestedPriceText = Math.round(currentCalculation.totalCost * (1 + profitMargin/100)).toLocaleString('vi-VN');

    const prompt = `Bạn là chuyên gia tư vấn sản xuất và định giá nội thất cao cấp. Người dùng đã tạo một bảng tính chi phí vật tư sơ bộ.

**Thông tin sản phẩm:**
- **Tên:** ${itemName}
- **Kích thước:** ${dimensions}
- **Mô tả thêm:** ${description || 'Không có'}
${chatHistory.length > 0 ? `\n**Lưu ý từ người dùng (toàn bộ cuộc hội thoại trước):**\n${chatHistory.map(c => `${c.role}: ${c.parts[0].text}`).join('\n')}` : ''}

**Bảng tính chi phí vật tư của người dùng:**
${breakdownText}
- **TỔNG CHI PHÍ VẬT TƯ:** ${Math.round(currentCalculation.totalCost).toLocaleString('vi-VN')}đ
- **Tỷ suất lợi nhuận mong muốn:** ${profitMargin}%
- **Giá bán đề xuất (tạm tính theo vật tư):** ${suggestedPriceText}đ

**Nhiệm vụ của bạn:**
Phân tích thông tin trên một cách **chuyên sâu và thực tế**.
1.  **Phân tích chi phí:** Nhận xét về tính hợp lý của chi phí vật tư do người dùng cung cấp.
2.  **Ước tính Chi phí ẩn:** Dựa vào kinh nghiệm, xác định và **đưa ra giá trị ước tính (bằng VNĐ)** cho các chi phí ẩn quan trọng mà người dùng có thể đã bỏ qua. Đây là phần quan trọng nhất.
3.  **Đưa ra Giá bán tham khảo:** Dựa trên tổng chi phí (vật tư + chi phí ẩn bạn ước tính) và phân tích thị trường, hãy đề xuất một mức giá bán cuối cùng hợp lý.

**Yêu cầu định dạng đầu ra:**
Trả về một đối tượng JSON duy nhất, **KHÔNG** thêm bất kỳ văn bản giải thích nào bên ngoài JSON. Cấu trúc phải là:
{
  "keyObservations": [
    "Một nhận xét quan trọng về tính hợp lý của chi phí hoặc số lượng vật tư.",
    "Một điểm đáng ngờ hoặc không nhất quán trong dữ liệu được cung cấp."
  ],
  "hiddenCosts": [
    { "item": "Chi phí nhân công lắp ráp & hoàn thiện", "estimatedCost": 500000, "reason": "Dựa trên độ phức tạp ước tính của sản phẩm." },
    { "item": "Chi phí vật tư phụ (keo, vít, giấy nhám...)", "estimatedCost": 75000, "reason": "Ước tính khoảng 3-5% tổng chi phí ván." },
    { "item": "Chi phí vận chuyển & lắp đặt tại nhà khách", "estimatedCost": 300000, "reason": "Chi phí trung bình cho khu vực nội thành." }
  ],
  "optimizationTips": [
    "Một mẹo tối ưu hóa chi phí cụ thể và dễ thực hiện để giảm giá thành."
  ],
  "finalPricingAnalysis": {
    "suggestedMarketPrice": 9500000,
    "summary": "Dựa trên tổng chi phí ước tính (vật tư + ẩn) và so sánh với các sản phẩm tương tự trên thị trường, mức giá này vừa đảm bảo lợi nhuận cạnh tranh, vừa hấp dẫn đối với khách hàng mục tiêu."
  }
}
`;
    
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;
    resultContainer.innerHTML = '';
    
    try {
        const resultObject = await callGeminiAPI(prompt, uploadedImage);
        if (resultObject) {
            const suggestedPrice = currentCalculation.totalCost * (1 + (profitMargin / 100));
            lastGeminiResult = {
                ...resultObject,
                costBreakdown: currentCalculation.breakdown,
                totalCost: currentCalculation.totalCost,
                suggestedSellingPrice: suggestedPrice,
                estimatedProfit: suggestedPrice - currentCalculation.totalCost
            };
            resultContainer.innerHTML = formatAnalysisToHtml(resultObject);
            saveItemBtn.disabled = false;
            showToast('Phân tích AI hoàn tất!', 'success');
        } else {
            resultContainer.innerHTML = '<p>AI không thể đưa ra phân tích. Vui lòng thử lại.</p>';
            showToast('Không nhận được phân tích từ AI.', 'error');
        }
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = `<i class="fas fa-cogs"></i> Nhờ AI Phân tích`;
    }
});

// --- Saved Items Logic ---
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
    items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    items.forEach(item => {
        const tr = document.createElement('tr');
        const createdAtDate = item.createdAt?.toDate();
        tr.innerHTML = `
            <td>${item.name}</td>
            <td>${createdAtDate ? createdAtDate.toLocaleDateString('vi-VN') : 'N/A'}</td>
            <td class="text-center">
                <button class="copy-item-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${item.id}" title="Dùng làm mẫu"><i class="fas fa-copy"></i></button>
                <button class="view-item-btn text-green-500 hover:text-green-700 mr-2" data-id="${item.id}" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                <button class="delete-item-btn text-red-500 hover:text-red-700" data-id="${item.id}" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        savedItemsTableBody.appendChild(tr);
    });
}

saveItemBtn.addEventListener('click', async () => {
    if (!currentUserId || !lastGeminiResult) return;
    const itemName = document.getElementById('item-name').value.trim();
    if (!itemName) { showToast('Vui lòng nhập tên dự án để lưu.', 'error'); return; }

    const formData = {
        name: document.getElementById('item-name').value,
        length: document.getElementById('item-length').value,
        width: document.getElementById('item-width').value,
        height: document.getElementById('item-height').value,
        itemType: document.getElementById('item-type').value,
        woodId: document.getElementById('material-wood').value,
        edgeId: document.getElementById('material-edge').value,
        backPanelId: document.getElementById('material-back-panel').value,
        accessories: addedAccessories,
        description: document.getElementById('product-description').value,
        profitMargin: document.getElementById('profit-margin').value,
    };

    try {
        await addDoc(savedItemsCollectionRef, {
            name: itemName,
            formData: formData,
            geminiAnalysis: lastGeminiResult,
            createdAt: serverTimestamp()
        });
        showToast(`Đã lưu thành công dự án "${itemName}"!`, 'success');
        lastGeminiResult = null;
        saveItemBtn.disabled = true;
    } catch (error) { 
        showToast('Lỗi khi lưu dự án.', 'error');
        console.error("Error saving item:", error); 
    }
});

savedItemsTableBody.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!currentUserId || !btn) return;
    const id = btn.dataset.id;
    const tabsContainer = document.getElementById('tabs');

    if (btn.classList.contains('delete-item-btn')) {
        if (await showConfirm('Bạn có chắc chắn muốn xóa dự án này?')) {
            await deleteDoc(doc(db, `users/${currentUserId}/savedItems`, id));
            showToast('Đã xóa dự án.', 'info');
        }
    } else if (btn.classList.contains('copy-item-btn')) {
        const item = localSavedItems.find(i => i.id === id);
        if (item && item.formData) {
            tabsContainer.querySelector('button[data-tab="calculator"]').click();
            
            document.getElementById('item-name').value = item.formData.name || '';
            document.getElementById('item-length').value = item.formData.length || '';
            document.getElementById('item-width').value = item.formData.width || '';
            document.getElementById('item-height').value = item.formData.height || '';
            document.getElementById('item-type').value = item.formData.itemType || 'khac';
            document.getElementById('material-wood').value = item.formData.woodId || '';
            document.getElementById('material-edge').value = item.formData.edgeId || '';
            document.getElementById('material-back-panel').value = item.formData.backPanelId || '';
            document.getElementById('product-description').value = item.formData.description || '';
            document.getElementById('profit-margin').value = item.formData.profitMargin || '50';

            addedAccessories = item.formData.accessories ? [...item.formData.accessories] : [];
            renderAddedAccessories();
            
            updateClientSideCosts();

            resultContainer.innerHTML = '';
            lastGeminiResult = null;
            saveItemBtn.disabled = true;

            showToast('Đã tải thông tin. Sẵn sàng để chỉnh sửa!', 'success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            showToast('Không thể tải dữ liệu mẫu cho dự án này.', 'error');
        }
    } else if (btn.classList.contains('view-item-btn')) {
        const item = localSavedItems.find(i => i.id === id);
        if (item) {
            document.getElementById('view-item-title').textContent = item.name;
            const viewContent = document.getElementById('view-item-content');
            viewContent.innerHTML = formatAnalysisToHtml(item.geminiAnalysis);
            openModal(viewItemModal);
        }
    }
});

// --- AI Assistant Chat Logic ---
function initializeChat() {
    chatHistory = [];
    chatMessagesContainer.innerHTML = '';
    renderChatMessage('Xin chào! Tôi là Trợ lý AI của bạn. Hãy dạy tôi cách bạn tính giá, hoặc hỏi tôi bất cứ điều gì. Những gì bạn nói sẽ được dùng làm ngữ cảnh cho các lần tính toán sau. Lưu ý: cuộc trò chuyện sẽ được đặt lại khi bạn đăng xuất.', 'system');
}

function renderChatMessage(message, role) {
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `chat-message ${role}`;

    let content;
    if (role === 'typing') {
        content = `<div class="icon"><i class="fas fa-robot"></i></div><div class="message-content typing-indicator"><span></span><span></span><span></span></div>`;
    } else if (role === 'system') {
        content = `<p>${message}</p>`;
    } else {
        const iconClass = role === 'user' ? 'fa-user' : 'fa-robot';
        content = `<div class="icon"><i class="fas ${iconClass}"></i></div><div class="message-content">${message}</div>`;
    }
    
    messageWrapper.innerHTML = content;
    chatMessagesContainer.appendChild(messageWrapper);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    return messageWrapper;
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = chatInput.value.trim();
    if (!userMessage || isAwaitingChatResponse) return;

    isAwaitingChatResponse = true;
    chatInput.value = '';
    chatInput.disabled = true;
    sendChatBtn.disabled = true;

    chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    renderChatMessage(userMessage, 'user');
    const typingIndicator = renderChatMessage('', 'typing');

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatHistory: chatHistory, newChatMessage: userMessage }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Lỗi máy chủ: ${response.status}`);
        
        const modelResponse = result.text;
        chatHistory.push({ role: 'model', parts: [{ text: modelResponse }] });
        typingIndicator.remove();
        renderChatMessage(modelResponse, 'model');

    } catch (error) {
        typingIndicator.remove();
        renderChatMessage(`Lỗi: ${error.message}`, 'system');
    } finally {
        isAwaitingChatResponse = false;
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.focus();
    }
});

// --- Gemini API Call (Client-side via Serverless Function) ---
async function callGeminiAPI(prompt, image) {
    const spinner = `<div class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75"><div class="spinner"></div></div>`;
    resultContainer.innerHTML = spinner;
    saveItemBtn.disabled = true;
    lastGeminiResult = null;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image }),
        });

        const resultData = await response.json();
        if (!response.ok) throw new Error(resultData.error || `Lỗi máy chủ: ${response.status}`);
        return resultData;
    } catch (error) {
        console.error("Lỗi khi gọi API:", error);
        const errorMessage = error.message.includes("API key not valid") 
            ? "Lỗi: API Key không hợp lệ. Vui lòng kiểm tra lại trên Vercel."
            : `Lỗi khi gọi API: ${error.message}`;
        resultContainer.textContent = errorMessage;
        showToast('Đã xảy ra lỗi khi phân tích. Vui lòng thử lại.', 'error');
        return null;
    }
}

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeModals();
    initializeImageUploader(
        (imageData) => { uploadedImage = imageData; },
        () => { uploadedImage = null; }
    );
    
    updateClientSideCosts();
});
