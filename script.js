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
let componentNamesCollectionRef = null;
let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let unsubscribeComponentNames = null;
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
let allLocalMaterials = []; // Flat array for filtering and sorting
let localSavedItems = [];
let localComponentNames = []; // For the new component name manager
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

const sampleComponentNames = [
    { name: 'Hông Trái', notes: 'Vách bên trái tủ' },
    { name: 'Hông Phải', notes: 'Vách bên phải tủ' },
    { name: 'Đáy', notes: 'Tấm ván dưới cùng' },
    { name: 'Nóc', notes: 'Tấm ván trên cùng' },
    { name: 'Hậu', notes: 'Tấm ván phía sau' },
    { name: 'Cánh Mở', notes: '' },
    { name: 'Đợt Cố Định', notes: '' },
    { name: 'Vách Ngăn', notes: 'Vách chia khoang' },
];

async function addSampleData(userId) {
    const materialsRef = collection(db, `users/${userId}/materials`);
    for (const material of sampleMaterials) {
        await addDoc(materialsRef, material);
    }
    const componentNamesRef = collection(db, `users/${userId}/componentNames`);
    for (const name of sampleComponentNames) {
        await addDoc(componentNamesRef, name);
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
            showToast('Đã thêm dữ liệu vật tư và chi tiết mẫu cho bạn!', 'info');
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
        await checkAndAddSampleData(currentUserId);
        listenForData();
    } else {
        currentUserId = null;
        if (unsubscribeMaterials) unsubscribeMaterials();
        if (unsubscribeSavedItems) unsubscribeSavedItems();
        if (unsubscribeComponentNames) unsubscribeComponentNames();
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
}

function clearLocalData() {
    localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
    allLocalMaterials = [];
    localSavedItems = [];
    localComponentNames = [];
    renderMaterials([]);
    renderSavedItems([]);
    renderComponentNames([]);
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

/**
 * Parses board thickness from material name or notes.
 * @param {object} material The material object.
 * @returns {number} The thickness in mm.
 */
function getBoardThickness(material) {
    const DEFAULT_THICKNESS = 17;
    if (!material) return DEFAULT_THICKNESS;
    const combinedText = `${material.name} ${material.notes || ''}`;
    // Matches "17mm", "17ly", "17 mm" etc.
    const match = combinedText.match(/(\d+)\s*(mm|ly|li)/i);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return DEFAULT_THICKNESS;
}


// --- New: Component Management ---

/**
 * Generates the list of product components based on main form inputs.
 */
function generateProductComponents() {
    const l = parseFloat(DOM.itemLengthInput.value) || 0;
    const w = parseFloat(DOM.itemWidthInput.value) || 0;
    const h = parseFloat(DOM.itemHeightInput.value) || 0;
    const type = DOM.itemTypeSelect.value;
    
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const mainWoodMaterial = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const t = getBoardThickness(mainWoodMaterial);

    const newComponents = [];
    if (!l || !w || !h) {
        productComponents = [];
        return;
    }

    // Default component properties, including position and rotation
    const pos = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    
    // Common parts. The positions are calculated relative to the center (0,0,0) of the bounding box.
    const hongTrai = { ...pos, name: 'Hông Trái', length: w, width: h, qty: 1, isDefault: true, x: (-l/2 + t/2), ry: 90 };
    const hongPhai = { ...pos, name: 'Hông Phải', length: w, width: h, qty: 1, isDefault: true, x: (l/2 - t/2), ry: 90 };
    const day = { ...pos, name: 'Đáy', length: l - 2*t, width: w, qty: 1, isDefault: true, y: (h/2 - t/2), rx: 90 };
    const noc = { ...pos, name: 'Nóc', length: l - 2*t, width: w, qty: 1, isDefault: true, y: (-h/2 + t/2), rx: 90 };
    const hau = { ...pos, name: 'Hậu', length: l, width: h, qty: 1, isDefault: true, materialType: 'back', z: (-w/2 + t/2) };

    // Type specific parts
    switch(type) {
        case 'tu-bep-duoi':
            const dotNgangTruoc = { ...pos, name: 'Đợt ngang trước', length: l - 2*t, width: 100, qty: 1, isDefault: true, y: (-h/2 + t/2), z: (w/2 - 50), rx: 90 };
            const dotNgangSau = { ...pos, name: 'Đợt ngang sau', length: l - 2*t, width: 100, qty: 1, isDefault: true, y: (-h/2 + t/2), z: (-w/2 + 50), rx: 90 };
            newComponents.push(hongTrai, hongPhai, day, dotNgangTruoc, dotNgangSau, hau);
            break;
        case 'tu-bep-tren':
            newComponents.push(hongTrai, hongPhai, day, noc, hau);
            break;
        case 'tu-ao':
            newComponents.push(hongTrai, hongPhai, day, noc); // No back panel by default for wardrobe calculation
            break;
        case 'khac': // Box with 4 sides
            newComponents.push(hongTrai, hongPhai, day, noc);
            break;
    }
    
    // Add unique IDs
    const finalNewComponents = newComponents.map((comp, i) => ({ ...comp, id: `comp_${Date.now()}_${i}` }));

    // Merge with existing custom components
    const customComponents = productComponents.filter(p => !p.isDefault);
    productComponents = [...finalNewComponents, ...customComponents].map(p => ({...p, length: Math.round(p.length), width: Math.round(p.width)}));
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

        // Initialize the combobox for this new row
        const comboboxContainer = tr.querySelector(`#comp-name-combobox-${comp.id}`);
        if(comboboxContainer) {
            initializeCombobox(
                comboboxContainer, 
                localComponentNames.map(c => ({ id: c.id, name: c.name, price: '', unit: ''})), // Adapt data for combobox
                (selectedId) => {
                    const selectedName = localComponentNames.find(c => c.id === selectedId)?.name;
                    const component = productComponents.find(p => p.id === comp.id);
                    if (component && selectedName) {
                        component.name = selectedName;
                        // The main input's change listener will handle the rest
                    }
                },
                { placeholder: 'Chọn tên...', allowCustom: true }
            );
        }

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
 */
function getPanelPiecesForAI() {
    const pieces = [];
    const backPanelId = DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value;

    productComponents.forEach(comp => {
        if (comp.materialType === 'back' && backPanelId) {
            return;
        }

        for (let i = 0; i < comp.qty; i++) {
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


/**
 * Applies current filter, sort, and pagination options and then renders the material list.
 */
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
    
    const totalItems = materialsToProcess.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = materialsToProcess.slice(startIndex, endIndex);

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


// --- Component Name Management ---
function listenForComponentNames() {
    if (unsubscribeComponentNames) unsubscribeComponentNames();
    unsubscribeComponentNames = onSnapshot(componentNamesCollectionRef, snapshot => {
        localComponentNames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localComponentNames.sort((a,b) => a.name.localeCompare(b.name, 'vi'));
        renderComponentNames(localComponentNames);
        renderProductComponents(); // Re-render table with new combobox options
    }, console.error);
}

function renderComponentNames(names) {
    DOM.componentNamesTableBody.innerHTML = '';
    if (names.length === 0) {
        DOM.componentNamesTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 1rem; color: var(--text-light);">Chưa có tên chi tiết nào được tạo.</td></tr>`;
        return;
    }
    names.forEach(cn => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Tên">${cn.name}</td>
            <td data-label="Ghi chú">${cn.notes || ''}</td>
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
        notes: DOM.componentNameForm['component-name-notes'].value
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
            DOM.componentNameForm['component-name-notes'].value = cn.notes;
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
    DOM.componentNameForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Tên';
    DOM.cancelComponentNameEditBtn.classList.add('hidden');
}


function populateComboboxes() {
    const allAccessoryMaterials = [
        ...localMaterials['Ván'],
        ...localMaterials['Phụ kiện'],
        ...localMaterials['Gia Công']
    ];

    if (DOM.mainMaterialWoodCombobox?.updateComboboxData) {
        DOM.mainMaterialWoodCombobox.updateComboboxData(localMaterials['Ván']);
    }
    if (DOM.mainMaterialBackPanelCombobox?.updateComboboxData) {
        DOM.mainMaterialBackPanelCombobox.updateComboboxData(localMaterials['Ván']);
    }
    if (DOM.mainMaterialAccessoriesCombobox?.updateComboboxData) {
        DOM.mainMaterialAccessoriesCombobox.updateComboboxData(allAccessoryMaterials);
    }
    if (DOM.edgeMaterialCombobox?.updateComboboxData) {
        DOM.edgeMaterialCombobox.updateComboboxData(localMaterials['Cạnh']);
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
    
    if (DOM.mainMaterialAccessoriesCombobox.setValue) {
        DOM.mainMaterialAccessoriesCombobox.setValue('');
    }

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
    if (DOM.edgeMaterialCombobox.setValue) DOM.edgeMaterialCombobox.setValue('');

    updateAnalyzeButton();
    DOM.aiAnalysisSection.classList.add('hidden');
    DOM.saveItemBtn.disabled = true;
    
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
        - **Quy tắc:** Một chi tiết ván sẽ được dán cả 4 cạnh. Tuy nhiên, những cạnh giao nhau hoặc tiếp xúc với các chi tiết khác (ví dụ: đáy, nóc, hậu) sẽ KHÔNG được dán. Cạnh tiếp xúc sàn nhà, tường, hoặc mặt đá bếp cũng không dán. Chỉ tính các cạnh có thể nhìn thấy hoặc chạm vào được ở sản phẩm cuối cùng. Cánh tủ luôn được dán cả 4 cạnh.
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
        
        recalculateFinalPrice();
        addDynamicPricingListeners();
        
        DOM.saveItemBtn.disabled = false;

    } catch (error) {
        console.error("Error calling AI:", error);
        if (error.message.includes('503') || error.message.includes('overloaded')) {
             showToast('AI đang quá tải, vui lòng thử lại sau giây lát.', 'info');
        } else {
             showToast(`Lỗi khi phân tích: ${error.message}`, 'error');
        }
        calculationState = 'idle';
    } finally {
        DOM.aiLoadingPlaceholder.classList.add('hidden');
        DOM.aiResultsContent.classList.remove('hidden');
        updateAnalyzeButton();
    }
}

/**
 * Recalculates the final price based on the last AI analysis and current form inputs.
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
    
    // 3. Edge Banding Cost (from AI and selected material)
    const edgeBandingData = lastGeminiResult?.edgeBanding;
    const edgeMaterialId = DOM.edgeMaterialCombobox.querySelector('.combobox-value').value;
    const edgeMaterial = localMaterials['Cạnh'].find(m => m.id === edgeMaterialId);

    if (edgeBandingData && edgeBandingData.totalLength > 0) {
        if (edgeMaterial) {
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
                reason: `AI tính ${edgeBandingData.totalLength}mm. Vui lòng chọn vật tư 'Nẹp cạnh' để tính giá.`
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
    
    DOM.totalCostValue.textContent = totalCost.toLocaleString('vi-VN') + 'đ';
    DOM.suggestedPriceValue.textContent = suggestedPrice.toLocaleString('vi-VN') + 'đ';
    DOM.estimatedProfitValue.textContent = estimatedProfit.toLocaleString('vi-VN') + 'đ';
    DOM.priceSummaryContainer.classList.remove('hidden');

    renderCostBreakdown(costBreakdownItems, DOM.costBreakdownContainer);

    if(!lastGeminiResult) lastGeminiResult = {};
    lastGeminiResult.finalPrices = { totalCost, suggestedPrice, estimatedProfit, costBreakdown: costBreakdownItems };
}


let dynamicListenersAdded = false;
function addDynamicPricingListeners() {
    if (dynamicListenersAdded) return;
    
    DOM.laborCostInput.addEventListener('input', recalculateFinalPrice);
    DOM.profitMarginInput.addEventListener('input', recalculateFinalPrice);
    
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
            description: DOM.productDescriptionInput.value,
            profitMargin: DOM.profitMarginInput.value,
            laborCost: DOM.laborCostInput.value,
            mainWoodId: DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value,
            backPanelId: DOM.mainMaterialBackPanelCombobox.querySelector('.combobox-value').value,
            edgeMaterialId: DOM.edgeMaterialCombobox.querySelector('.combobox-value').value,
            accessories: addedAccessories,
            components: productComponents
        },
        cuttingLayout: lastGeminiResult.cuttingLayout,
        edgeBanding: lastGeminiResult.edgeBanding,
        finalPrices: lastGeminiResult.finalPrices,
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


function loadItemIntoForm(item) {
    clearInputs();

    const inputs = item.inputs || {};

    DOM.itemLengthInput.value = inputs.length || '';
    DOM.itemWidthInput.value = inputs.width || '';
    DOM.itemHeightInput.value = inputs.height || '';
    DOM.itemNameInput.value = inputs.name || '';
    DOM.itemTypeSelect.value = inputs.type || 'khac';
    DOM.productDescriptionInput.value = inputs.description || '';
    DOM.profitMarginInput.value = inputs.profitMargin || '50';
    DOM.laborCostInput.value = inputs.laborCost || '0';

    if (DOM.mainMaterialWoodCombobox.setValue) {
        DOM.mainMaterialWoodCombobox.setValue(inputs.mainWoodId || '');
    }
    if (DOM.mainMaterialBackPanelCombobox.setValue) {
        DOM.mainMaterialBackPanelCombobox.setValue(inputs.backPanelId || '');
    }
     if (DOM.edgeMaterialCombobox.setValue) {
        DOM.edgeMaterialCombobox.setValue(inputs.edgeMaterialId || '');
    }
    
    if (inputs.accessories && Array.isArray(inputs.accessories)) {
        addedAccessories = JSON.parse(JSON.stringify(inputs.accessories));
        renderAccessories();
    }
    
    if (inputs.components && Array.isArray(inputs.components)) {
        productComponents = JSON.parse(JSON.stringify(inputs.components));
    } else {
        generateProductComponents();
    }
    renderProductComponents();


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

        recalculateFinalPrice();
        
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
    
    update3DPreview();

    showToast('Đã tải dữ liệu dự án. Bạn có thể chỉnh sửa và phân tích lại.', 'info');
}


function renderItemDetailsToModal(itemId) {
    const item = localSavedItems.find(i => i.id === itemId);
    if (!item) {
        showToast('Không tìm thấy dự án.', 'error');
        return;
    }

    const inputs = item.inputs || {};
    const finalPrices = item.finalPrices || {};
    const costBreakdown = finalPrices.costBreakdown || [];
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

// --- Image Dimension Analysis ---
async function handleImageAnalysis() {
    if (!uploadedImage) {
        showToast('Vui lòng tải lên một hình ảnh trước.', 'error');
        return;
    }

    DOM.analyzeImageBtn.disabled = true;
    DOM.analyzeImageBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;

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
            handleFormUpdate();
        } else {
            showToast('Không tìm thấy kích thước nào trong ảnh. Vui lòng thử ảnh khác rõ ràng hơn.', 'info');
        }

    } catch (error) {
        console.error("Error analyzing image dimensions:", error);
        showToast(`Lỗi phân tích ảnh: ${error.message}`, 'error');
    } finally {
        DOM.analyzeImageBtn.disabled = false;
        DOM.analyzeImageBtn.innerHTML = `<i class="fas fa-ruler-combined"></i><span>Phân tích Kích thước</span>`;
    }
}

DOM.analyzeImageBtn.addEventListener('click', handleImageAnalysis);


// --- Image Structure Analysis (New) ---
async function handleImageStructureAnalysis() {
    if (!uploadedImage) {
        showToast('Vui lòng tải lên một hình ảnh trước.', 'error');
        return;
    }
    const l = parseFloat(DOM.itemLengthInput.value);
    const w = parseFloat(DOM.itemWidthInput.value);
    const h = parseFloat(DOM.itemHeightInput.value);

    if (!l || !w || !h) {
        showToast('Vui lòng nhập kích thước tổng thể của sản phẩm trước khi phân tích cấu trúc.', 'error');
        return;
    }

    DOM.analyzeStructureBtn.disabled = true;
    DOM.analyzeStructureBtn.innerHTML = `<span class="spinner-sm"></span> Đang phân tích...`;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                analyzeStructure: true,
                image: uploadedImage,
                dimensions: { l, w, h }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Lỗi không xác định từ máy chủ');
        }

        if (Array.isArray(data) && data.length > 0) {
            // Add unique IDs to the components returned by AI
            productComponents = data.map((comp, i) => ({
                ...comp,
                id: `comp_${Date.now()}_${i}`,
                isDefault: false // Mark as non-default so manual changes don't wipe them
            }));
            renderProductComponents();
            update3DPreview();
            showToast(`AI đã phân tích và tạo ra ${data.length} chi tiết cấu thành!`, 'success');
        } else {
            showToast('AI không thể xác định cấu trúc từ hình ảnh. Vui lòng thử ảnh khác rõ ràng hơn.', 'info');
        }

    } catch (error) {
        console.error("Error analyzing image structure:", error);
        showToast(`Lỗi phân tích cấu trúc: ${error.message}`, 'error');
    } finally {
        DOM.analyzeStructureBtn.disabled = false;
        DOM.analyzeStructureBtn.innerHTML = `<i class="fas fa-sitemap"></i><span>Phân tích Cấu trúc & Vị trí</span>`;
    }
}
DOM.analyzeStructureBtn.addEventListener('click', handleImageStructureAnalysis);


// --- AI Configuration from Text ---
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
        
        if(data.materialName) {
            const allWood = localMaterials['Ván'];
            let bestMatch = null;
            let highestScore = 0;

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


// --- 3D Preview ---
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
    
    const mainWoodId = DOM.mainMaterialWoodCombobox.querySelector('.combobox-value').value;
    const mainWoodMaterial = localMaterials['Ván'].find(m => m.id === mainWoodId);
    const t = getBoardThickness(mainWoodMaterial); 

    const productContainer = document.createElement('div');
    productContainer.className = 'product-3d-container';

    const maxDim = Math.max(l, w, h);
    const scale = 180 / maxDim;

    productComponents.forEach(comp => {
        if (comp.length <= 0 || comp.width <= 0 || comp.qty <= 0) return;

        for (let i = 0; i < comp.qty; i++) {
            const panel = document.createElement('div');
            panel.className = 'component-3d-panel';
            panel.dataset.label = `${comp.name}${comp.qty > 1 ? ` ${i + 1}` : ''}`;

            const s_compW = comp.length * scale;
            const s_compH = comp.width * scale;
            const s_t = t * scale;
            
            // Positioning from component data
            const x = (comp.x || 0) * scale;
            const y = (comp.y || 0) * scale;
            const z = (comp.z || 0) * scale;
            const rx = comp.rx || 0;
            const ry = comp.ry || 0;
            const rz = comp.rz || 0;
            
            panel.style.width = `${s_compW}px`;
            panel.style.height = `${s_compH}px`;
            panel.style.transform = `
                translateX(${x}px) 
                translateY(${y}px) 
                translateZ(${z}px) 
                rotateX(${rx}deg) 
                rotateY(${ry}deg) 
                rotateZ(${rz}deg)
            `;
            panel.style.setProperty('--thickness', `${s_t}px`);
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
    
    initializeCombobox(
        DOM.mainMaterialWoodCombobox, [], 
        () => { if (calculationState === 'done') recalculateFinalPrice(); update3DPreview(); }, 
        { placeholder: "Tìm hoặc chọn ván chính..." }
    );
    initializeCombobox(
        DOM.mainMaterialBackPanelCombobox, [], 
        () => { if (calculationState === 'done') recalculateFinalPrice(); }, 
        { placeholder: "Tìm hoặc chọn ván hậu...", allowEmpty: true, emptyOptionText: 'Dùng chung ván chính' }
    );
    initializeCombobox(
        DOM.edgeMaterialCombobox, [], 
        () => { if (calculationState === 'done') recalculateFinalPrice(); }, 
        { placeholder: "Tìm hoặc chọn loại nẹp..." }
    );
    initializeCombobox(
        DOM.mainMaterialAccessoriesCombobox, [], null, 
        { placeholder: "Tìm phụ kiện, gia công..." }
    );

    initializeQuickCalc(localMaterials, showToast);

    const formUpdateInputs = [DOM.itemLengthInput, DOM.itemWidthInput, DOM.itemHeightInput, DOM.itemTypeSelect];
    formUpdateInputs.forEach(input => input.addEventListener('input', handleFormUpdate));

    DOM.componentsTableBody.addEventListener('change', e => {
        if (e.target.classList.contains('component-input')) {
            const id = e.target.closest('tr').dataset.id;
            const field = e.target.dataset.field;
            const value = e.target.value;
            const component = productComponents.find(p => p.id === id);
            if (component) {
                component[field] = (field === 'name') ? value : parseFloat(value) || 0;
                component.isDefault = false;
                update3DPreview();
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
            x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0,
            isDefault: false
        });
        renderProductComponents();
        update3DPreview();
    });

    handleFormUpdate();
});