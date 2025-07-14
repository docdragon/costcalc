// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut, setDoc
} from './firebase.js';

import { 
    openModal, closeModal, showConfirm, showToast, updateUIVisibility, 
    initializeImageUploader, initializeTabs, initializeModals, initializeMathInput,
    initializeCombobox
} from './ui.js';
import { initializeQuickCalc, updateQuickCalcMaterials } from './quick-calc.js';
import * as DOM from './dom.js';


// --- Global State ---
let currentUserId = null;
let materialsCollectionRef = null;
let savedItemsCollectionRef = null;
let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
let allLocalMaterials = []; // Flat array for filtering and sorting
let localSavedItems = [];
let lastGeminiResult = null;
let addedAccessories = [];
let productComponents = [];
let uploadedImage = null;
let calculationState = 'idle'; // idle, calculating, done
let currentPage = 1;
const itemsPerPage = 10;


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
        listenForData();
    } else {
        currentUserId = null;
        if (unsubscribeMaterials) unsubscribeMaterials();
        if (unsubscribeSavedItems) unsubscribeSavedItems();
        clearLocalData();
    }
    updateUIVisibility(loggedIn, user);
    DOM.initialLoader.style.opacity = '0';
    setTimeout(() => DOM.initialLoader.style.display = 'none', 300);
});

function listenForData() {
    listenForMaterials();
    listenForSavedItems();
}

function clearLocalData() {
    localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
    allLocalMaterials = [];
    localSavedItems = [];
    renderMaterials([]);
    renderSavedItems([]);
    populateComboboxes();
    updateQuickCalcMaterials(localMaterials); // Clear quick calc comboboxes too
}

DOM.logoutBtn.addEventListener('click', () => signOut(auth));

// --- Helper & Renderer Functions ---

/**
 * Parses sheet dimensions from material notes (e.g., "Khổ 1220x2440mm").
 * @param {object} material The material object.
 * @returns {number} The area of the sheet in square meters. Returns a standard area if not found.
 */
function getSheetArea(material) {
    const STANDARD_SHEET_AREA_M2 = 1.22 * 2.44;
    if (!material || !material.notes) return STANDARD_SHEET_AREA_M2;
    // Regex to find dimensions like 1220x2440 or 1220 x 2440
    const match = material.notes.match(/(\d+)\s*x\s*(\d+)/);
    if (match && match[1] && match[2]) {
        const widthMM = parseInt(match[1], 10);
        const heightMM = parseInt(match[2], 10);
        // Convert from mm^2 to m^2
        return (widthMM * heightMM) / 1000000;
    }
    return STANDARD_SHEET_AREA_M2;
}


// --- New: Component Management ---

/**
 * Generates the list of product components based on main form inputs.
 */
function generateProductComponents() {
    const l = parseFloat(DOM.itemLengthInput.value) || 0;
    const w = parseFloat(DOM.itemWidthInput.value) || 0;
    const h = parseFloat(DOM.itemHeightInput.value) || 0;
    const compartments = parseInt(DOM.itemCompartmentsInput.value, 10) || 1;
    const type = DOM.itemTypeSelect.value;
    
    const newComponents = [];
    if (!l || !w || !h) {
        productComponents = [];
        return;
    }

    // Common parts
    newComponents.push({ id: `comp_${Date.now()}_1`, name: 'Hông Trái', length: w, width: h, qty: 1, isDefault: true });
    newComponents.push({ id: `comp_${Date.now()}_2`, name: 'Hông Phải', length: w, width: h, qty: 1, isDefault: true });

    // Type specific parts
    switch(type) {
        case 'tu-bep-duoi':
            newComponents.push({ id: `comp_${Date.now()}_3`, name: 'Đáy', length: l, width: w, qty: 1, isDefault: true });
            newComponents.push({ id: `comp_${Date.now()}_4`, name: 'Đợt ngang trên', length: l, width: 100, qty: 2, isDefault: true });
            newComponents.push({ id: `comp_${Date.now()}_5`, name: 'Hậu', length: l, width: h, qty: 1, isDefault: true, materialType: 'back' });
            break;
        case 'tu-bep-tren':
            newComponents.push({ id: `comp_${Date.now()}_3`, name: 'Đáy', length: l, width: w, qty: 1, isDefault: true });
            newComponents.push({ id: `comp_${Date.now()}_4`, name: 'Nóc', length: l, width: w, qty: 1, isDefault: true });
            newComponents.push({ id: `comp_${Date.now()}_5`, name: 'Hậu', length: l, width: h, qty: 1, isDefault: true, materialType: 'back' });
            break;
        case 'tu-ao':
            newComponents.push({ id: `comp_${Date.now()}_3`, name: 'Đáy', length: l, width: w, qty: 1, isDefault: true });
            newComponents.push({ id: `comp_${Date.now()}_4`, name: 'Nóc', length: l, width: w, qty: 1, isDefault: true });
            // Wardrobes often don't have a back panel in this calculation, so it's omitted by default.
            break;
        case 'khac': // Box with 4 sides
            newComponents.push({ id: `comp_${Date.now()}_3`, name: 'Đáy', length: l, width: w, qty: 1, isDefault: true });
            newComponents.push({ id: `comp_${Date.now()}_4`, name: 'Nóc', length: l, width: w, qty: 1, isDefault: true });
            break;
    }

    // Dividers and Doors based on compartments
    if (type.includes('tu-') && compartments > 1) {
        newComponents.push({ id: `comp_${Date.now()}_6`, name: 'Vách Ngăn', length: w, width: h, qty: compartments - 1, isDefault: true });
    }
    if (type.includes('tu-') && compartments > 0) {
        const doorWidth = Math.round(l / compartments);
        newComponents.push({ id: `comp_${Date.now()}_7`, name: 'Cánh', length: doorWidth, width: h, qty: compartments, isDefault: true });
    }
    
    // Merge with existing custom components
    const customComponents = productComponents.filter(p => !p.isDefault);
    productComponents = [...newComponents, ...customComponents].map(p => ({...p, length: Math.round(p.length), width: Math.round(p.width)}));
}


/**
 * Renders the productComponents array into the components table.
 */
function renderProductComponents() {
    DOM.componentsTableBody.innerHTML = '';
    if (!productComponents || productComponents.length === 0) {
        DOM.componentsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--text-light);">Nhập kích thước sản phẩm để xem chi tiết.</td></tr>';
        return;
    }
    productComponents.forEach(comp => {
        const tr = document.createElement('tr');
        tr.dataset.id = comp.id;
        tr.innerHTML = `
            <td data-label="Tên Chi tiết"><input type="text" class="input-style component-input" data-field="name" value="${comp.name}"></td>
            <td data-label="Dài (mm)"><input type="text" inputmode="decimal" class="input-style component-input" data-field="length" value="${comp.length}"></td>
            <td data-label="Rộng (mm)"><input type="text" inputmode="decimal" class="input-style component-input" data-field="width" value="${comp.width}"></td>
            <td data-label="SL"><input type="text" inputmode="decimal" class="input-style component-input" data-field="qty" value="${comp.qty}" style="max-width: 60px; text-align: center;"></td>
            <td data-label="Xóa" class="text-center">
                <button class="remove-component-btn" data-id="${comp.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        DOM.componentsTableBody.appendChild(tr);
    });
}

/**
 * Handles updates from the main form inputs to regenerate the component list.
 */
function handleFormUpdate() {
    generateProductComponents();
    renderProductComponents();
    update3DPreview();
}


/**
 * Reads the component table and returns a list of pieces for AI analysis.
 * This function now replaces the old, static getPanelPieces.
 */
function getPanelPiecesForAI() {
    const pieces = [];
    const backPanelId = DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value;

    productComponents.forEach(comp => {
        // Exclude pieces that use the back panel material if it's specified separately.
        // The AI's job is to optimize the MAIN wood. The back panel is calculated separately.
        if (comp.materialType === 'back' && backPanelId) {
            return; // Skip this component for the AI prompt
        }

        // Add a piece for each quantity
        for (let i = 0; i < comp.qty; i++) {
            // AI prompt needs width & height, which corresponds to our length & width
            const pieceName = `${comp.name}${comp.qty > 1 ? ` (${i + 1})` : ''}`;
            pieces.push({ name: pieceName, width: comp.length, height: comp.width });
        }
    });

    return pieces.filter(p => p.width > 0 && p.height > 0);
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

// --- Materials Management ---
function listenForMaterials() {
    if (unsubscribeMaterials) unsubscribeMaterials(); 
    unsubscribeMaterials = onSnapshot(materialsCollectionRef, snapshot => {
        // Clear categorized object for dropdowns
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

        // Update the flat array used for the main list view
        allLocalMaterials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        displayMaterials(); // Render with current filters/sort
        populateComboboxes();  // Update all dropdowns in the app
        updateQuickCalcMaterials(localMaterials); // Update Quick Calc comboboxes
    }, console.error);
}


/**
 * Applies current filter, sort, and pagination options and then renders the material list.
 */
function displayMaterials() {
    let materialsToProcess = [...allLocalMaterials];
    const filterText = DOM.materialFilterInput.value.toLowerCase().trim();
    const sortBy = DOM.materialSortSelect.value;

    // 1. Filter
    if (filterText) {
        materialsToProcess = materialsToProcess.filter(m => 
            m.name.toLowerCase().includes(filterText) || 
            (m.notes && m.notes.toLowerCase().includes(filterText))
        );
    }

    // 2. Sort
    switch (sortBy) {
        case 'name-asc':
            materialsToProcess.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
            break;
        case 'name-desc':
            materialsToProcess.sort((a, b) => b.name.localeCompare(a.name, 'vi'));
            break;
        case 'price-asc':
            materialsToProcess.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            materialsToProcess.sort((a, b) => b.price - a.price);
            break;
        case 'type':
            materialsToProcess.sort((a, b) => a.type.localeCompare(b.type, 'vi') || a.name.localeCompare(b.name, 'vi'));
            break;
    }
    
    // 3. Paginate
    const totalItems = materialsToProcess.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = materialsToProcess.slice(startIndex, endIndex);

    // 4. Render
    renderMaterials(paginatedItems);
    updatePaginationControls(totalPages);
}

function updatePaginationControls(totalPages) {
    if (totalPages <= 1) {
        DOM.paginationControls.classList.add('hidden');
        return;
    }
    DOM.paginationControls.classList.remove('hidden');

    DOM.pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
    DOM.prevPageBtn.disabled = currentPage === 1;
    DOM.nextPageBtn.disabled = currentPage === totalPages;
}

DOM.materialFilterInput.addEventListener('input', () => {
    currentPage = 1;
    displayMaterials();
});
DOM.materialSortSelect.addEventListener('change', () => {
    currentPage = 1;
    displayMaterials();
});
DOM.prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        displayMaterials();
    }
});
DOM.nextPageBtn.addEventListener('click', () => {
    // A check to prevent going beyond the actual last page if items were deleted.
    const totalPages = Math.ceil(allLocalMaterials.length / itemsPerPage) || 1;
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
        // Use the flat array to find the material
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

function populateComboboxes() {
    // Combine materials for the general accessory adder (excluding edge banding)
    const allAccessoryMaterials = [
        ...localMaterials['Ván'],
        ...localMaterials['Phụ kiện'],
        ...localMaterials['Gia Công']
    ];

    // Update main calculator comboboxes
    if (DOM.mainMaterialWoodCombobox && DOM.mainMaterialWoodCombobox.updateComboboxData) {
        DOM.mainMaterialWoodCombobox.updateComboboxData(localMaterials['Ván']);
    }
    if (DOM.mainMaterialBackPanelCombobox && DOM.mainMaterialBackPanelCombobox.updateComboboxData) {
        DOM.mainMaterialBackPanelCombobox.updateComboboxData(localMaterials['Ván']);
    }
    if (DOM.mainMaterialAccessoriesCombobox && DOM.mainMaterialAccessoriesCombobox.updateComboboxData) {
        DOM.mainMaterialAccessoriesCombobox.updateComboboxData(allAccessoryMaterials);
    }
}


// --- Accessory Management ---
DOM.addAccessoryBtn.addEventListener('click', () => {
    const selectedId = DOM.mainMaterialAccessoriesCombobox.querySelector('.combobox-value').value;
    const quantity = parseFloat(DOM.accessoryQuantityInput.value);

    if (!selectedId) {
        showToast('Vui lòng chọn một vật tư từ danh sách.', 'error');
        return;
    }
    if (!quantity || quantity <= 0) {
        showToast('Vui lòng nhập số lượng hợp lệ.', 'error');
        return;
    }

    const material = allLocalMaterials.find(a => a.id === selectedId);
     if (!material) {
        showToast('Lỗi: Không tìm thấy vật tư đã chọn.', 'error');
        return;
    }

    const existing = addedAccessories.find(a => a.id === selectedId);

    if (existing) {
        existing.quantity += quantity;
    } else {
        addedAccessories.push({ ...material, quantity });
    }
    renderAccessories();
    DOM.accessoryQuantityInput.value = '1';
    
    // Reset combobox
    if (DOM.mainMaterialAccessoriesCombobox.setValue) {
        DOM.mainMaterialAccessoriesCombobox.setValue('');
    } else { // Fallback
        DOM.mainMaterialAccessoriesCombobox.querySelector('.combobox-input').value = '';
        DOM.mainMaterialAccessoriesCombobox.querySelector('.combobox-value').value = '';
    }


    // Recalculate price if analysis is already done
    if (calculationState === 'done') {
        recalculateFinalPrice();
    }
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
        const id = e.target.dataset.id;
        addedAccessories = addedAccessories.filter(a => a.id !== id);
        renderAccessories();
        if (calculationState === 'done') {
            recalculateFinalPrice();
        }
    }
});

DOM.accessoriesList.addEventListener('change', e => {
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
    DOM.itemLengthInput.value = '';
    DOM.itemWidthInput.value = '';
    DOM.itemHeightInput.value = '';
    DOM.itemNameInput.value = '';
    DOM.productDescriptionInput.value = '';
    DOM.profitMarginInput.value = '50';
    DOM.laborCostInput.value = '0';
    DOM.itemCompartmentsInput.value = '1';
    DOM.aiConfigPrompt.value = '';
    
    addedAccessories = [];
    renderAccessories();
    
    productComponents = [];
    renderProductComponents();

    lastGeminiResult = null;
    calculationState = 'idle';
    DOM.removeImageBtn.click();

    // Reset comboboxes
    if (DOM.mainMaterialWoodCombobox.setValue) DOM.mainMaterialWoodCombobox.setValue('');
    if (DOM.mainMaterialBackPanelCombobox.setValue) DOM.mainMaterialBackPanelCombobox.setValue('');

    // Reset UI
    updateAnalyzeButton();
    DOM.aiAnalysisSection.classList.add('hidden');
    DOM.saveItemBtn.disabled = true;
    
    // Reset 3D viewer
    update3DPreview();
}

// --- Calculation Logic ---
function updateAnalyzeButton() {
    switch(calculationState) {
        case 'idle':
            DOM.analyzeBtn.disabled = false;
            DOM.analyzeBtn.innerHTML = '<i class="fas fa-microchip"></i> Phân tích & Báo giá với AI';
            break;
        case 'calculating':
            DOM.analyzeBtn.disabled = true;
            DOM.analyzeBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;
            break;
        case 'done':
            DOM.analyzeBtn.disabled = false;
            DOM.analyzeBtn.innerHTML = '<i class="fas fa-redo"></i> Phân tích lại';
            break;
    }
}

async function runAICalculation() {
    calculationState = 'calculating';
    updateAnalyzeButton();
    DOM.aiAnalysisSection.classList.remove('hidden');
    
    DOM.aiLoadingPlaceholder.classList.remove('hidden');
    DOM.aiResultsContent.classList.add('hidden');
    
    const mainWoodPieces = getPanelPiecesForAI();

    // If there are no pieces to cut, still run for edge banding.
    if(mainWoodPieces.length === 0 && productComponents.length === 0) {
        showToast("Không có chi tiết nào để phân tích.", "info");
        calculationState = 'idle'; 
        updateAnalyzeButton();
        DOM.aiLoadingPlaceholder.classList.add('hidden');
        DOM.aiResultsContent.add('hidden');
        return;
    }

    const productInfoForAI = {
        name: DOM.itemNameInput.value,
        type: DOM.itemTypeSelect.value,
        length: DOM.itemLengthInput.value,
        width: DOM.itemWidthInput.value,
        height: DOM.itemHeightInput.value,
        compartments: DOM.itemCompartmentsInput.value,
        description: DOM.productDescriptionInput.value
    };

    const prompt = `
    NHIỆM VỤ: Bạn là một trợ lý AI chuyên nghiệp cho xưởng mộc, chuyên tối ưu hóa sản xuất và tính toán chi phí.
    BỐI CẢNH: Người dùng đang thiết kế một sản phẩm nội thất.
    DỮ LIỆU ĐẦU VÀO:
    - Thông tin sản phẩm: ${JSON.stringify(productInfoForAI)}
    - Danh sách các miếng ván chính cần cắt (JSON): ${JSON.stringify(mainWoodPieces.map(({type, ...rest}) => rest))}
    - Toàn bộ danh sách chi tiết cấu thành (gồm cả ván hậu): ${JSON.stringify(productComponents)}

    HƯỚNG DẪN THỰC HIỆN:
    1.  **Sơ đồ cắt ván (Bin Packing) cho VÁN CHÍNH:**
        - Chỉ sử dụng các miếng trong "Danh sách các miếng ván chính cần cắt". Nếu danh sách này trống, bỏ qua bước này.
        - Kích thước tấm ván tiêu chuẩn là 1220mm x 2440mm.
        - Thực hiện thuật toán sắp xếp 2D. Ưu tiên xếp các miếng ván theo chiều dọc (chiều cao của miếng ván song song với cạnh 2440mm của tấm ván).
        - Cho phép xoay các miếng ván 90 độ NẾU việc đó giúp tối ưu hóa và giảm tổng số tấm ván cần dùng.
        - Trả về kết quả trong đối tượng JSON có tên "cuttingLayout".

    2.  **Tính toán Dán Cạnh (Edge Banding):**
        - Dựa vào "Toàn bộ danh sách chi tiết cấu thành" và "Thông tin sản phẩm" để xác định những cạnh nào cần dán nẹp.
        - **Quy tắc:** Dán tất cả các cạnh lộ ra bên ngoài. KHÔNG dán các cạnh tiếp xúc với tường, sàn nhà, hoặc các tấm ván khác. Cánh tủ được dán cả 4 cạnh.
        - Ví dụ cho tủ bếp dưới: không dán cạnh sau của đáy, nóc, hông. Không dán cạnh trên của hông (tiếp xúc với mặt đá). Không dán các cạnh của vách ngăn tiếp xúc với đáy, nóc, hậu.
        - Tính tổng chiều dài (mm) của tất cả các cạnh cần dán.
        - Trả về kết quả trong đối tượng JSON "edgeBanding".

    3.  **ĐỊNH DẠNG ĐẦU RA (QUAN TRỌNG):**
        - Chỉ trả về một đối tượng JSON duy nhất.
        - Đối tượng JSON này phải chứa "cuttingLayout" và "edgeBanding".
        - Không thêm bất kỳ văn bản, giải thích, hay ghi chú nào khác bên ngoài đối tượng JSON.
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
            renderCuttingLayout(cuttingLayout, DOM.cuttingLayoutContainer, DOM.cuttingLayoutSummary);
            DOM.cuttingLayoutSection.classList.remove('hidden');
        } else {
            DOM.cuttingLayoutSection.classList.add('hidden');
        }
        
        recalculateFinalPrice(); // Perform initial client-side price calculation
        addDynamicPricingListeners(); // Add listeners for dynamic updates
        
        DOM.saveItemBtn.disabled = false;

    } catch (error) {
        console.error("Error calling AI:", error);
        if (error.message.includes('503') || error.message.includes('overloaded')) {
             showToast('AI đang quá tải, vui lòng thử lại sau giây lát.', 'info');
        } else {
             showToast(`Lỗi khi phân tích: ${error.message}`, 'error');
        }
        calculationState = 'idle'; // Revert state
    } finally {
        DOM.aiLoadingPlaceholder.classList.add('hidden');
        DOM.aiResultsContent.classList.remove('hidden');
        updateAnalyzeButton();
    }
}

/**
 * Recalculates the final price based on the last AI analysis and current form inputs.
 * This is now the single source of truth for all pricing.
 */
function recalculateFinalPrice() {
    if (calculationState !== 'done') return;

    const costBreakdownItems = [];
    let baseMaterialCost = 0;

    // 1. Main Wood Cost (from AI's cutting layout)
    const totalSheetsUsed = lastGeminiResult?.cuttingLayout?.totalSheetsUsed || 0;
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const mainWoodMaterial = localMaterials['Ván'].find(m => m.id === mainWoodId);

    if (mainWoodMaterial && totalSheetsUsed > 0) {
        const cost = totalSheetsUsed * mainWoodMaterial.price;
        baseMaterialCost += cost;
        costBreakdownItems.push({
            name: `Ván chính: ${mainWoodMaterial.name}`,
            cost: cost,
            reason: `${totalSheetsUsed} tấm x ${mainWoodMaterial.price.toLocaleString('vi-VN')}đ (tối ưu bởi AI)`
        });
    }

    // 2. Back Panel Cost (calculated client-side)
    const backPanelId = DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value;
    const backPanelPieces = productComponents.filter(p => p.materialType === 'back');

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
                    reason: `Ước tính ${sheetsNeeded} tấm x ${backPanelMaterial.price.toLocaleString('vi-VN')}đ`
                });
            }
        }
    }
    
    // 3. Edge Banding Cost (from AI)
    const edgeBandingData = lastGeminiResult?.edgeBanding;
    if (edgeBandingData && edgeBandingData.totalLength > 0) {
        const edgeMaterial = allLocalMaterials.find(m => m.type === 'Cạnh');
        if (edgeMaterial) {
            // totalLength is in mm, price is per meter.
            const lengthInMeters = edgeBandingData.totalLength / 1000;
            const cost = lengthInMeters * edgeMaterial.price;
            baseMaterialCost += cost;
            costBreakdownItems.push({
                name: `Nẹp cạnh: ${edgeMaterial.name}`,
                cost: cost,
                reason: `AI tính toán ${edgeBandingData.totalLength}mm (${lengthInMeters.toFixed(2)}m) x ${edgeMaterial.price.toLocaleString('vi-VN')}đ/m`
            });
        } else {
             costBreakdownItems.push({
                name: `Nẹp cạnh cần thiết`,
                cost: 0,
                reason: `AI tính toán ${edgeBandingData.totalLength}mm. Không tìm thấy vật tư loại 'Cạnh' trong kho để tính giá.`
            });
        }
    }

    // 4. All other accessories from the list
    addedAccessories.forEach(acc => {
        const material = allLocalMaterials.find(m => m.id === acc.id);
        if (!material) return;

        let cost = acc.quantity * material.price;
        let reason = `${acc.quantity} ${material.unit} x ${material.price.toLocaleString('vi-VN')}đ`;
        
        if(cost > 0) {
            baseMaterialCost += cost;
            costBreakdownItems.push({
                name: `${material.name}`,
                cost: cost,
                reason: reason
            });
        }
    });

    const laborCost = parseFloat(DOM.laborCostInput.value) || 0;
    const profitMargin = parseFloat(DOM.profitMarginInput.value) || 0;
    
    const totalCost = baseMaterialCost + laborCost;
    const suggestedPrice = totalCost * (1 + profitMargin / 100);
    const estimatedProfit = suggestedPrice - totalCost;
    
    // Update the summary cards
    DOM.totalCostValue.textContent = totalCost.toLocaleString('vi-VN') + 'đ';
    DOM.suggestedPriceValue.textContent = suggestedPrice.toLocaleString('vi-VN') + 'đ';
    DOM.estimatedProfitValue.textContent = estimatedProfit.toLocaleString('vi-VN') + 'đ';
    DOM.priceSummaryContainer.classList.remove('hidden');

    // Update the detailed cost breakdown view
    renderCostBreakdown(costBreakdownItems, DOM.costBreakdownContainer);

    // Update the lastGeminiResult object to store the calculated prices for saving
    if(!lastGeminiResult) lastGeminiResult = {};
    lastGeminiResult.finalPrices = { totalCost, suggestedPrice, estimatedProfit, costBreakdown: costBreakdownItems };
}


let dynamicListenersAdded = false;
function addDynamicPricingListeners() {
    if (dynamicListenersAdded) return;
    
    DOM.laborCostInput.addEventListener('input', recalculateFinalPrice);
    DOM.profitMarginInput.addEventListener('input', recalculateFinalPrice);
    // Accessory changes are handled by their own listeners which now also call recalculateFinalPrice
    // The combobox onSelect listeners also now call recalculateFinalPrice

    dynamicListenersAdded = true;
}


DOM.analyzeBtn.addEventListener('click', async () => {
    if (!currentUserId) {
        showToast('Vui lòng đăng nhập để sử dụng tính năng này.', 'error');
        return;
    }
    const itemName = DOM.itemNameInput.value.trim();
    if (!itemName) {
        showToast('Vui lòng nhập Tên sản phẩm / dự án.', 'error');
        return;
    }
     const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
     if (!mainWoodId) {
        showToast('Vui lòng chọn vật liệu Ván chính.', 'error');
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
    DOM.savedItemsTableBody.innerHTML = '';
    if (items.length === 0) {
        DOM.savedItemsTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 1rem; color: var(--text-light);">Chưa có dự án nào được lưu.</td></tr>`;
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
        DOM.savedItemsTableBody.appendChild(tr);
    });
}


DOM.saveItemBtn.addEventListener('click', async () => {
    if (!currentUserId || !lastGeminiResult || !lastGeminiResult.finalPrices) {
        showToast('Không có kết quả phân tích để lưu.', 'error');
        return;
    }
    
    const itemData = {
        inputs: {
            name: DOM.itemNameInput.value,
            length: DOM.itemLengthInput.value,
            width: DOM.itemWidthInput.value,
            height: DOM.itemHeightInput.value,
            type: DOM.itemTypeSelect.value,
            compartments: DOM.itemCompartmentsInput.value,
            description: DOM.productDescriptionInput.value,
            profitMargin: DOM.profitMarginInput.value,
            laborCost: DOM.laborCostInput.value,
            mainWoodId: DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value,
            backPanelId: DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value,
            accessories: addedAccessories,
            components: productComponents // Save the components list
        },
        cuttingLayout: lastGeminiResult.cuttingLayout,
        edgeBanding: lastGeminiResult.edgeBanding, // Save edge banding info
        finalPrices: lastGeminiResult.finalPrices, // Save the client-calculated prices and breakdown
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

    DOM.itemLengthInput.value = inputs.length || '';
    DOM.itemWidthInput.value = inputs.width || '';
    DOM.itemHeightInput.value = inputs.height || '';
    DOM.itemNameInput.value = inputs.name || '';
    DOM.itemTypeSelect.value = inputs.type || 'khac';
    DOM.itemCompartmentsInput.value = inputs.compartments || '1';
    DOM.productDescriptionInput.value = inputs.description || '';
    DOM.profitMarginInput.value = inputs.profitMargin || '50';
    DOM.laborCostInput.value = inputs.laborCost || '0';

    if (DOM.mainMaterialWoodCombobox.setValue) {
        DOM.mainMaterialWoodCombobox.setValue(inputs.mainWoodId || '');
    }
    if (DOM.mainMaterialBackPanelCombobox.setValue) {
        DOM.mainMaterialBackPanelCombobox.setValue(inputs.backPanelId || '');
    }
    
    if (inputs.accessories && Array.isArray(inputs.accessories)) {
        addedAccessories = JSON.parse(JSON.stringify(inputs.accessories));
        renderAccessories();
    }
    
    // Load components list
    if (inputs.components && Array.isArray(inputs.components)) {
        productComponents = JSON.parse(JSON.stringify(inputs.components));
        renderProductComponents();
    } else {
        // If old save format, generate them
        handleFormUpdate();
    }


    // Reconstruct lastGeminiResult from saved data
    lastGeminiResult = {
        cuttingLayout: item.cuttingLayout,
        edgeBanding: item.edgeBanding,
        finalPrices: item.finalPrices, 
    };

    if(lastGeminiResult) {
        calculationState = 'done';
        DOM.saveItemBtn.disabled = false;
        updateAnalyzeButton();
        
        DOM.aiAnalysisSection.classList.remove('hidden');
        DOM.aiResultsContent.classList.remove('hidden');

        recalculateFinalPrice(); // Recalculate and render prices and breakdown
        
        const { cuttingLayout } = lastGeminiResult;
        if (cuttingLayout) {
            renderCuttingLayout(cuttingLayout, DOM.cuttingLayoutContainer, DOM.cuttingLayoutSummary);
            DOM.cuttingLayoutSection.classList.remove('hidden');
        } else {
            DOM.cuttingLayoutSection.classList.add('hidden');
        }

        addDynamicPricingListeners();
    }

    const calculatorTabBtn = document.querySelector('button[data-tab="calculator"]');
    if (calculatorTabBtn) calculatorTabBtn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Trigger form update to regenerate components and 3D view
    handleFormUpdate();

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
    const finalPrices = item.finalPrices || {};
    const costBreakdown = finalPrices.costBreakdown || item.costBreakdown?.woodCosts ? 
        [...(item.costBreakdown.woodCosts || []), ...(item.costBreakdown.edgeCosts || []), ...(item.costBreakdown.accessoryCosts || [])] : []; // For backwards compatibility
    const cuttingLayout = item.cuttingLayout || {};
    
    DOM.viewItemTitle.textContent = `Chi tiết dự án: ${inputs.name || 'Không tên'}`;
    
    const mainWood = allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Không rõ';
    const backPanel = allLocalMaterials.find(m => m.id === inputs.backPanelId)?.name || 'Dùng ván chính';
    
    let accessoriesHtml = 'Không có';

    if (inputs.accessories && inputs.accessories.length > 0) {
        accessoriesHtml = '<ul>' + inputs.accessories.map(a => `<li>${a.name} (SL: ${a.quantity} ${a.unit})</li>`).join('') + '</ul>';
    }

    let breakdownHtml = '<p>Không có phân tích chi phí.</p>';
    if (costBreakdown.length > 0) {
        const tempContainer = document.createElement('div');
        renderCostBreakdown(costBreakdown, tempContainer);
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

    DOM.viewItemContent.innerHTML = `
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
            <li><strong>Ván hậu:</strong> ${backPanel}</li>
            <li><strong>Vật tư khác:</strong> ${accessoriesHtml}</li>
        </ul>
        
        ${breakdownHtml}
        
        <div class="result-box" style="margin-top: 1.5rem;">
             <h3 class="result-box-header"><i class="fas fa-th-large"></i> Sơ đồ Cắt ván Gợi ý</h3>
             ${layoutHtml}
        </div>
    `;

    openModal(DOM.viewItemModal);
}

// --- New: Image Dimension Analysis ---
async function handleImageAnalysis() {
    if (!uploadedImage) {
        showToast('Vui lòng tải lên một hình ảnh trước.', 'error');
        return;
    }

    DOM.analyzeImageBtn.disabled = true;
    DOM.analyzeImageBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích ảnh...`;

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
            DOM.itemLengthInput.value = data.length;
            fieldsUpdated++;
        }
        if (data.width) {
            DOM.itemWidthInput.value = data.width;
            fieldsUpdated++;
        }
        if (data.height) {
            DOM.itemHeightInput.value = data.height;
            fieldsUpdated++;
        }

        if (fieldsUpdated > 0) {
            showToast(`AI đã điền ${fieldsUpdated} thông số kích thước!`, 'success');
             // Trigger 3D viewer update and component generation
            handleFormUpdate();
        } else {
            showToast('Không tìm thấy kích thước nào trong ảnh. Vui lòng thử ảnh khác rõ ràng hơn.', 'info');
        }

    } catch (error) {
        console.error("Error analyzing image dimensions:", error);
        showToast(`Lỗi phân tích ảnh: ${error.message}`, 'error');
    } finally {
        DOM.analyzeImageBtn.disabled = false;
        DOM.analyzeImageBtn.innerHTML = `<i class="fas fa-search-plus"></i><span>Phân tích Kích thước từ Ảnh</span>`;
    }
}

DOM.analyzeImageBtn.addEventListener('click', handleImageAnalysis);

// --- New: AI Configuration from Text ---
async function handleAIConfig() {
    const text = DOM.aiConfigPrompt.value.trim();
    if (!text) {
        showToast('Vui lòng nhập mô tả sản phẩm.', 'error');
        return;
    }
    
    DOM.aiConfigBtn.disabled = true;
    DOM.aiConfigBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;
    
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
        
        if(data.length) { DOM.itemLengthInput.value = data.length; updatedFields++; }
        if(data.width) { DOM.itemWidthInput.value = data.width; updatedFields++; }
        if(data.height) { DOM.itemHeightInput.value = data.height; updatedFields++; }
        if(data.itemName) { DOM.itemNameInput.value = data.itemName; updatedFields++; }
        if(data.itemType) { DOM.itemTypeSelect.value = data.itemType; updatedFields++; }
        if(data.compartments) { DOM.itemCompartmentsInput.value = data.compartments; updatedFields++; }
        
        if(data.materialName) {
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

            if (bestMatch && DOM.mainMaterialWoodCombobox.setValue) {
                DOM.mainMaterialWoodCombobox.setValue(bestMatch);
                updatedFields++;
            }
        }
        
        if (updatedFields > 0) {
            showToast(`AI đã điền ${updatedFields} thông tin sản phẩm!`, 'success');
            // Trigger 3D viewer update and component generation
            handleFormUpdate();
        } else {
            showToast('AI không thể trích xuất thông tin từ mô tả của bạn.', 'info');
        }

    } catch(error) {
        console.error("AI Config Error:", error);
        showToast(`Lỗi cấu hình AI: ${error.message}`);
    } finally {
        DOM.aiConfigBtn.disabled = false;
        DOM.aiConfigBtn.innerHTML = `<i class="fas fa-cogs"></i> Tạo Sản phẩm từ Mô tả`;
    }
}
DOM.aiConfigBtn.addEventListener('click', handleAIConfig);


// --- New: 3D Preview ---
function update3DPreview() {
    const scene = DOM.viewer3dContainer.querySelector('.scene-3d');
    if (!scene) return;
    scene.innerHTML = '';

    const l = Number(DOM.itemLengthInput.value) || 0;
    const w = Number(DOM.itemWidthInput.value) || 0;
    const h = Number(DOM.itemHeightInput.value) || 0;

    if (l === 0 || w === 0 || h === 0 || productComponents.length === 0) {
        return;
    }

    const productContainer = document.createElement('div');
    productContainer.className = 'product-3d-container';

    const maxDim = Math.max(l, w, h);
    const scale = 180 / maxDim;
    const t = 17;

    const s_l = l * scale, s_w = w * scale, s_h = h * scale, s_t = t * scale;

    productComponents.forEach(comp => {
        if (comp.length <= 0 || comp.width <= 0 || comp.qty <= 0) return;

        for (let i = 0; i < comp.qty; i++) {
            const panel = document.createElement('div');
            panel.className = 'component-3d-panel';
            panel.dataset.label = `${comp.name}${comp.qty > 1 ? ` ${i + 1}` : ''}`;

            let transforms = [];
            let s_compW = comp.length * scale;
            let s_compH = comp.width * scale;

            switch (comp.name) {
                case 'Hông Trái':
                    transforms = [`translateX(${-s_l / 2 + s_t / 2}px)`, 'rotateY(90deg)'];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
                case 'Hông Phải':
                    transforms = [`translateX(${s_l / 2 - s_t / 2}px)`, 'rotateY(90deg)'];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
                case 'Đáy':
                    transforms = [`translateY(${s_h / 2 - s_t / 2}px)`, 'rotateX(90deg)'];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
                case 'Nóc':
                    transforms = [`translateY(${-s_h / 2 + s_t / 2}px)`, 'rotateX(90deg)'];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
                case 'Hậu':
                    transforms = [`translateZ(${-s_w / 2 + s_t / 2}px)`];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
                case 'Vách Ngăn':
                    const compartmentWidth = s_l / (comp.qty + 1);
                    transforms = [`translateX(${(i + 1) * compartmentWidth - s_l / 2}px)`];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
                case 'Cánh':
                    const doorWidth = comp.length * scale;
                    const totalDoorsWidth = doorWidth * comp.qty;
                    const startX = -totalDoorsWidth / 2;
                    transforms = [`translateX(${startX + i * doorWidth + doorWidth / 2}px)`, `translateZ(${s_w / 2}px)`];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
                case 'Đợt ngang trên':
                     const yPos = -s_h / 2 + s_t / 2 + (i * (s_h - s_t - (comp.width*scale)));
                     transforms = [`translateZ(${s_w / 2 - (comp.length*scale)/2}px)`, `translateY(${yPos}px)`];
                     s_compW = comp.length * scale; s_compH = comp.width*scale;
                     break;
                default:
                    transforms = ['translateZ(0)'];
                    s_compW = comp.length * scale; s_compH = comp.width * scale;
                    break;
            }
            panel.style.width = `${s_compW}px`;
            panel.style.height = `${s_compH}px`;
            panel.style.transform = transforms.join(' ');
            productContainer.appendChild(panel);
        }
    });
    scene.appendChild(productContainer);
}


function initialize3DPreview() {
    const scene = DOM.viewer3dContainer.querySelector('.scene-3d');
    
    let mouseX = 0, mouseY = 0;
    let rotX = -20, rotY = -30;
    let isDragging = false;

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - mouseX;
        const dy = e.clientY - mouseY;
        rotY += dx * 0.5;
        rotX -= dy * 0.5;
        rotX = Math.max(-90, Math.min(90, rotX));
        scene.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        mouseX = e.clientX;
        mouseY = e.clientY;
    }

    function onMouseDown(e) {
        isDragging = true;
        mouseX = e.clientX;
        mouseY = e.clientY;
        DOM.viewer3dContainer.style.cursor = 'grabbing';
    }

    function onMouseUp() {
        if (isDragging) {
            isDragging = false;
            DOM.viewer3dContainer.style.cursor = 'grab';
        }
    }

    DOM.viewer3dContainer.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Initial setup
    scene.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    update3DPreview();
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeModals();
    initializeImageUploader(
        (imageData) => { 
            uploadedImage = imageData;
            DOM.imageAnalysisContainer.classList.remove('hidden');
        },
        () => { 
            uploadedImage = null; 
            DOM.imageAnalysisContainer.classList.add('hidden');
        }
    );
    initialize3DPreview();
    initializeMathInput('.input-style[type="text"][inputmode="decimal"]');
    
    // Initialize main calculator comboboxes
    initializeCombobox(
        DOM.mainMaterialWoodCombobox, 
        [], 
        () => { if (calculationState === 'done') recalculateFinalPrice(); }, 
        { placeholder: "Tìm hoặc chọn ván chính..." }
    );
    initializeCombobox(
        DOM.mainMaterialBackPanelCombobox, 
        [], 
        () => { if (calculationState === 'done') recalculateFinalPrice(); }, 
        { placeholder: "Tìm hoặc chọn ván hậu...", allowEmpty: true, emptyOptionText: 'Dùng chung ván chính' }
    );
    initializeCombobox(
        DOM.mainMaterialAccessoriesCombobox, 
        [], 
        null, 
        { placeholder: "Tìm phụ kiện, gia công..." }
    );

    initializeQuickCalc(localMaterials, showToast);

    // --- Component Table Listeners ---
    const formUpdateInputs = [DOM.itemLengthInput, DOM.itemWidthInput, DOM.itemHeightInput, DOM.itemCompartmentsInput, DOM.itemTypeSelect];
    formUpdateInputs.forEach(input => input.addEventListener('input', handleFormUpdate));

    DOM.componentsTableBody.addEventListener('change', e => {
        if (e.target.classList.contains('component-input')) {
            const id = e.target.closest('tr').dataset.id;
            const field = e.target.dataset.field;
            const value = e.target.value;
            const component = productComponents.find(p => p.id === id);
            if (component) {
                component[field] = (field === 'name') ? value : parseFloat(value) || 0;
                component.isDefault = false; // Once edited, it's considered custom
                update3DPreview(); // Update 3D view on component change
            }
        }
    });

    DOM.componentsTableBody.addEventListener('click', e => {
        const deleteBtn = e.target.closest('.remove-component-btn');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            productComponents = productComponents.filter(p => p.id !== id);
            renderProductComponents();
            update3DPreview();
        }
    });

    DOM.addCustomComponentBtn.addEventListener('click', () => {
        productComponents.push({
            id: `comp_${Date.now()}`,
            name: 'Chi tiết Mới',
            length: 0,
            width: 0,
            qty: 1,
            isDefault: false
        });
        renderProductComponents();
        update3DPreview();
    });

    // Initial population
    handleFormUpdate();
});