// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut, setDoc
} from './firebase.js';

import { 
    openModal, closeModal, showConfirm, showToast, updateUIVisibility, 
    initializeImageUploader, initializeTabs, initializeModals, initializeMathInput,
    initializeCombobox, debounce, initializeCurrencyInputFormatting
} from './ui.js';
import { initializeQuickCalc, updateQuickCalcMaterials } from './quick-calc.js';
import * as DOM from './dom.js';
import { 
    initializeCalculator, updateCalculatorData, setUploadedImage,
    loadItemIntoForm, clearCalculatorInputs, getCalculatorStateForSave,
    loadComponentsByProductType
} from './calculator.js';
import { getSheetArea, getBoardThickness, parseNumber } from './utils.js';


// --- Global State ---
let currentUserId = null;
let materialsCollectionRef = null;
let savedItemsCollectionRef = null;
let componentNamesCollectionRef = null;
let productTypesCollectionRef = null;
let componentGroupsCollectionRef = null;

let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let unsubscribeComponentNames = null;
let unsubscribeProductTypes = null;
let unsubscribeComponentGroups = null;

// Local data stores
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
let allLocalMaterials = [];
let localSavedItems = [];
let localComponentNames = [];
let localProductTypes = [];
let localComponentGroups = [];
let currentEditingProductTypeId = null;
let currentEditingComponentGroupId = null;
let currentEditingItemId = null;

// Pagination state
let currentPage = 1;
const itemsPerPage = 10;
let cnCurrentPage = 1;
const cnItemsPerPage = 10;
let siCurrentPage = 1;
const siItemsPerPage = 5; // Projects are taller, so fewer per page


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
    { name: 'Hông Trái', lengthFormula: 'H', widthFormula: 'W', edge1: true, edge2: false, edge3: true, edge4: false },
    { name: 'Hông Phải', lengthFormula: 'H', widthFormula: 'W', edge1: true, edge2: false, edge3: true, edge4: false },
    { name: 'Đáy', lengthFormula: 'L - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
    { name: 'Nóc', lengthFormula: 'L - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
    { name: 'Hậu', lengthFormula: 'L', widthFormula: 'H', edge1: false, edge2: false, edge3: false, edge4: false },
    { name: 'Cánh Mở', lengthFormula: 'H - 4', widthFormula: '(L / 2) - 4', edge1: true, edge2: true, edge3: true, edge4: true },
    { name: 'Đợt Cố Định', lengthFormula: 'L - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
    { name: 'Vách Ngăn', lengthFormula: 'H - 2*t', widthFormula: 'W', edge1: true, edge2: false, edge3: false, edge4: false },
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
        
        updateCalculatorData({ userId: currentUserId });
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
        updateCalculatorData({ userId: null });
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

        updateCalculatorData({ materials: localMaterials, allMaterials: allLocalMaterials });
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
        price: parseNumber(DOM.materialForm['material-price'].value),
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
            // Manually trigger formatting for currency input
            if(DOM.materialForm['material-price'].value) DOM.materialForm['material-price'].dispatchEvent(new Event('input'));
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
        
        updateCalculatorData({ componentNames: localComponentNames });
        displayComponentNames();

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
            cn.name.toLowerCase().includes(filterText)
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

        updateCalculatorData({ productTypes: localProductTypes });
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
        
        updateCalculatorData({ componentGroups: localComponentGroups });
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


// --- Calculator Action Buttons ---
function updateCalculatorActionButtons() {
    const isEditing = !!currentEditingItemId;
    DOM.saveItemBtn.classList.toggle('hidden', isEditing);
    DOM.updateItemBtn.classList.toggle('hidden', !isEditing);
}


// --- Populate Dropdowns ---
function populateProductTypeDropdown() {
    if (DOM.itemTypeCombobox?.updateComboboxData) {
        DOM.itemTypeCombobox.updateComboboxData(localProductTypes);
    }
}

function populateComboboxes() {
    const allAccessoryMaterials = [ ...localMaterials['Phụ kiện'], ...localMaterials['Gia Công'], ...localMaterials['Cạnh'] ];

    if (DOM.mainMaterialWoodCombobox?.updateComboboxData) DOM.mainMaterialWoodCombobox.updateComboboxData(localMaterials['Ván']);
    if (DOM.mainMaterialBackPanelCombobox?.updateComboboxData) DOM.mainMaterialBackPanelCombobox.updateComboboxData(localMaterials['Ván']);
    if (DOM.mainMaterialAccessoriesCombobox?.updateComboboxData) DOM.mainMaterialAccessoriesCombobox.updateComboboxData(allAccessoryMaterials);
    if (DOM.edgeMaterialCombobox?.updateComboboxData) DOM.edgeMaterialCombobox.updateComboboxData(localMaterials['Cạnh']);
    if (DOM.addGroupCombobox?.updateComboboxData) DOM.addGroupCombobox.updateComboboxData(localComponentGroups);
}


// --- Saved Items Management ---
function listenForSavedItems() {
    if (unsubscribeSavedItems) unsubscribeSavedItems();
    unsubscribeSavedItems = onSnapshot(savedItemsCollectionRef, snapshot => {
        localSavedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displaySavedItems();
    }, console.error);
}

function displaySavedItems() {
    let itemsToProcess = [...localSavedItems];
    const filterText = DOM.savedItemsFilterInput ? DOM.savedItemsFilterInput.value.toLowerCase().trim() : '';

    if (filterText) {
        itemsToProcess = itemsToProcess.filter(item => {
            const inputs = item.inputs || {};
            
            // 1. Check project name and description
            const name = (inputs.name || '').toLowerCase();
            const description = (inputs.description || '').toLowerCase();
            if (name.includes(filterText) || description.includes(filterText)) {
                return true;
            }

            // 2. Check material names AND notes
            const usedMaterialIds = new Set();
            if (inputs.mainWoodId) usedMaterialIds.add(inputs.mainWoodId);
            if (inputs.backPanelId) usedMaterialIds.add(inputs.backPanelId);
            if (inputs.edgeMaterialId) usedMaterialIds.add(inputs.edgeMaterialId);
            
            if (inputs.accessories && Array.isArray(inputs.accessories)) {
                inputs.accessories.forEach(acc => {
                    if (acc.id) usedMaterialIds.add(acc.id);
                });
            }

            if (inputs.components && Array.isArray(inputs.components)) {
                inputs.components.forEach(comp => {
                    if (comp.materialId) usedMaterialIds.add(comp.materialId);
                });
            }
            
            // Now check if any of these materials' names or notes match the filter
            for (const materialId of usedMaterialIds) {
                const material = allLocalMaterials.find(m => m.id === materialId);
                if (material) {
                    const materialName = (material.name || '').toLowerCase();
                    const materialNotes = (material.notes || '').toLowerCase();
                    if (materialName.includes(filterText) || materialNotes.includes(filterText)) {
                        return true;
                    }
                }
            }

            return false;
        });
    }

    // Sort the entire filtered list by creation date
    itemsToProcess.sort((a, b) => (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0));

    // Pagination
    const totalItems = itemsToProcess.length;
    const totalPages = Math.ceil(totalItems / siItemsPerPage) || 1;
    if (siCurrentPage > totalPages) siCurrentPage = totalPages;

    const startIndex = (siCurrentPage - 1) * siItemsPerPage;
    const paginatedItems = itemsToProcess.slice(startIndex, startIndex + siItemsPerPage);

    renderSavedItems(paginatedItems);
    updateSavedItemsPaginationControls(totalPages);
}

function updateSavedItemsPaginationControls(totalPages) {
    if (!DOM.savedItemsPaginationControls) return;
    DOM.savedItemsPaginationControls.dataset.totalPages = totalPages;
    if (totalPages <= 1) {
        DOM.savedItemsPaginationControls.classList.add('hidden');
        return;
    }
    DOM.savedItemsPaginationControls.classList.remove('hidden');
    DOM.siPageInfo.textContent = `Trang ${siCurrentPage} / ${totalPages}`;
    DOM.siPrevPageBtn.disabled = siCurrentPage === 1;
    DOM.siNextPageBtn.disabled = siCurrentPage === totalPages;
}


function renderSavedItems(items) {
    DOM.savedItemsTableBody.innerHTML = '';
    if (items.length === 0) {
        DOM.savedItemsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 1rem; color: var(--text-light);">Không tìm thấy dự án nào.</td></tr>`;
        return;
    }

    items.forEach(item => {
        const tr = document.createElement('tr');
        const inputs = item.inputs || {};
        const itemName = inputs.name || 'Dự án không tên';
        const createdAt = item?.createdAt ? new Date(item.createdAt.toDate()).toLocaleString('vi-VN') : 'Không rõ';
        const finalPrices = item.finalPrices || {};
        const suggestedPrice = finalPrices.suggestedPrice || 0;
        const totalCost = finalPrices.totalCost || 0;
        const estimatedProfit = finalPrices.estimatedProfit || 0;

        const dims = (inputs.length && inputs.width && inputs.height) 
            ? `${inputs.length} x ${inputs.width} x ${inputs.height} mm` 
            : 'Không rõ kích thước';
        const mainWoodName = allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Chưa chọn ván';
        const descriptionHtml = inputs.description ? `<p class="project-description">${inputs.description}</p>` : '';

        tr.innerHTML = `
            <td data-label="Tên & Chi tiết Dự án">
                <div class="project-name-main">${itemName}</div>
                <div class="project-details-list">
                    <span class="project-detail-item"><i class="fas fa-fw fa-ruler-combined"></i> ${dims}</span>
                    <span class="project-detail-item"><i class="fas fa-fw fa-layer-group"></i> ${mainWoodName}</span>
                </div>
                ${descriptionHtml}
            </td>
            <td data-label="Giá Bán" class="font-semibold">${suggestedPrice.toLocaleString('vi-VN')}đ</td>
            <td data-label="Chi Phí">${totalCost.toLocaleString('vi-VN')}đ</td>
            <td data-label="Lợi Nhuận">${estimatedProfit.toLocaleString('vi-VN')}đ</td>
            <td data-label="Ngày tạo">${createdAt}</td>
            <td data-label="Thao tác" class="text-center">
                <button class="load-btn text-green-500 hover:text-green-700 mr-2" data-id="${item.id}" title="Tải lại dự án này"><i class="fas fa-upload"></i></button>
                <button class="view-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${item.id}" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                <button class="copy-btn text-purple-500 hover:text-purple-700 mr-2" data-id="${item.id}" title="Sao chép dự án"><i class="fas fa-copy"></i></button>
                <button class="delete-saved-item-btn text-red-500 hover:text-red-700" data-id="${item.id}" title="Xóa dự án"><i class="fas fa-trash"></i></button>
            </td>
        `;
        DOM.savedItemsTableBody.appendChild(tr);
    });
}

function renderItemDetailsToModal(itemId) {
    const item = localSavedItems.find(i => i.id === itemId);
    if (!item) return;

    const { inputs = {}, finalPrices = {} } = item;
    const costBreakdown = finalPrices.costBreakdown || [];
    
    const suggestedPrice = finalPrices.suggestedPrice || 0;
    const totalCost = finalPrices.totalCost || 0;
    const estimatedProfit = finalPrices.estimatedProfit || 0;

    DOM.viewItemTitle.textContent = `Chi tiết dự án: ${inputs.name || 'Không tên'}`;
    const mainWood = allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Không rõ';
    const backPanel = allLocalMaterials.find(m => m.id === inputs.backPanelId)?.name || 'Dùng ván chính';
    
    const accessoriesHtml = (inputs.accessories && inputs.accessories.length > 0)
        ? '<ul>' + inputs.accessories.map(a => `<li>${a.name} (SL: ${a.quantity} ${a.unit})</li>`).join('') + '</ul>'
        : '<p>Không có phụ kiện nào.</p>';
    
    let breakdownHtml = '<h3 class="result-box-header"><i class="fas fa-file-invoice-dollar"></i> Phân tích Chi phí Vật tư</h3><ul class="cost-list">';
    if (costBreakdown.length > 0) {
        costBreakdown.forEach(item => {
            breakdownHtml += `
                <li>
                    <span class="cost-item-name">${item.name}</span>
                    <span class="cost-item-value">${(Math.round(item.cost || 0)).toLocaleString('vi-VN')}đ</span>
                    ${item.reason ? `<p class="cost-item-reason">${item.reason}</p>` : ''}
                </li>
            `;
        });
        breakdownHtml += '</ul>';
    } else {
        breakdownHtml = '<p>Không có phân tích chi phí.</p>';
    }

    DOM.viewItemContent.innerHTML = `
        <div class="final-price-recommendation">
            <div class="final-price-main">
                <div class="final-price-label">Giá Bán Đề Xuất</div>
                <div class="final-price-value">${suggestedPrice.toLocaleString('vi-VN')}đ</div>
            </div>
            <div class="final-price-breakdown">
                <div><span class="breakdown-label">Tổng Chi Phí</span><span class="breakdown-value">${totalCost.toLocaleString('vi-VN')}đ</span></div>
                <div><span class="breakdown-label">Lợi Nhuận</span><span class="breakdown-value">${estimatedProfit.toLocaleString('vi-VN')}đ</span></div>
                <div><span class="breakdown-label">Biên Lợi Nhuận</span><span class="breakdown-value">${inputs.profitMargin || 'N/A'}%</span></div>
            </div>
        </div>
        <div class="modal-details-grid">
            <div class="modal-details-col">
                <h4><i class="fas fa-ruler-combined"></i>Thông số & Vật tư chính</h4>
                <ul>
                    <li><strong>Mô tả:</strong> ${inputs.description || 'Không có'}</li>
                    <li><strong>Kích thước (D x R x C):</strong> ${inputs.length || 'N/A'} x ${inputs.width || 'N/A'} x ${inputs.height || 'N/A'} mm</li>
                    <li><strong>Ván chính:</strong> ${mainWood}</li>
                    <li><strong>Ván hậu:</strong> ${backPanel}</li>
                    <li><strong>Chi phí nhân công:</strong> ${(parseNumber(inputs.laborCost) || 0).toLocaleString('vi-VN')}đ</li>
                </ul>
                <h4><i class="fas fa-cogs"></i>Phụ kiện & Vật tư khác</h4>
                ${accessoriesHtml}
            </div>
            <div class="modal-details-col">
                ${breakdownHtml}
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
        (imageData, imageSrc) => { setUploadedImage(imageData); },
        () => { setUploadedImage(null); }
    );
    initializeMathInput('.input-style[type="text"][inputmode="decimal"]');
    initializeCurrencyInputFormatting('#labor-cost, #material-price, #qc-install-cost');
    
    // Initialize all modules
    initializeCalculator();
    initializeQuickCalc(localMaterials, showToast);
    updateCalculatorActionButtons();

    // Main form Comboboxes
    if (DOM.itemTypeCombobox) {
        initializeCombobox(DOM.itemTypeCombobox, [], (selectedId) => {
            loadComponentsByProductType(selectedId);
        }, { placeholder: "Tìm hoặc chọn loại sản phẩm...", allowEmpty: true, emptyOptionText: '-- Chọn loại sản phẩm --' });
    }
    initializeCombobox(DOM.mainMaterialWoodCombobox, [], null, { placeholder: "Tìm hoặc chọn ván chính..." });
    initializeCombobox(DOM.mainMaterialBackPanelCombobox, [], null, { placeholder: "Tìm ván hậu...", allowEmpty: true, emptyOptionText: 'Dùng chung ván chính' });
    initializeCombobox(DOM.edgeMaterialCombobox, [], null, { placeholder: "Tìm hoặc chọn loại nẹp..." });
    initializeCombobox(DOM.mainMaterialAccessoriesCombobox, [], null, { placeholder: "Tìm phụ kiện, gia công, nẹp..." });
    initializeCombobox(DOM.addGroupCombobox, [], null, { placeholder: "Tìm một cụm chi tiết..." });

    // Config tab Comboboxes
    initializeCombobox(DOM.ptComponentAddCombobox, [], null, { placeholder: "Tìm chi tiết để thêm..." });
    initializeCombobox(DOM.cgComponentAddCombobox, [], null, { placeholder: "Tìm chi tiết để thêm..." });

    // Event Listeners for actions that cross module boundaries
    DOM.saveItemBtn.addEventListener('click', async () => {
        const itemDataToSave = getCalculatorStateForSave();
        if (!itemDataToSave) return;
        
        const itemData = { ...itemDataToSave, createdAt: serverTimestamp() };
        try {
            await addDoc(savedItemsCollectionRef, itemData);
            showToast('Lưu dự án thành công!', 'success');
            DOM.clearFormBtn.click(); // Programmatically click the clear button
        } catch (error) {
            showToast('Lỗi khi lưu dự án.', 'error');
            console.error("Error saving item:", error);
        }
    });

    DOM.updateItemBtn.addEventListener('click', async () => {
        if (!currentEditingItemId) {
            showToast('Không có dự án nào đang được chỉnh sửa để cập nhật.', 'error');
            return;
        }
        const itemDataToSave = getCalculatorStateForSave();
        if (!itemDataToSave) return;

        const itemData = { ...itemDataToSave, updatedAt: serverTimestamp() };
        try {
            const itemRef = doc(db, `users/${currentUserId}/savedItems`, currentEditingItemId);
            await updateDoc(itemRef, itemData);
            showToast('Cập nhật dự án thành công!', 'success');
        } catch (error) {
            showToast('Lỗi khi cập nhật dự án.', 'error');
            console.error("Error updating item:", error);
        }
    });
    
    DOM.clearFormBtn.addEventListener('click', () => {
        clearCalculatorInputs();
        currentEditingItemId = null;
        updateCalculatorActionButtons();
        showToast('Đã xóa biểu mẫu. Sẵn sàng cho dự án mới.', 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });


    DOM.savedItemsTableBody.addEventListener('click', async e => {
        const viewBtn = e.target.closest('.view-btn');
        const deleteBtn = e.target.closest('.delete-saved-item-btn');
        const loadBtn = e.target.closest('.load-btn');
        const copyBtn = e.target.closest('.copy-btn');
    
        if (loadBtn) {
            const itemToLoad = localSavedItems.find(i => i.id === loadBtn.dataset.id);
            if (itemToLoad) {
                currentEditingItemId = itemToLoad.id;
                loadItemIntoForm(itemToLoad);
                updateCalculatorActionButtons();
            }
        } else if (viewBtn) {
            renderItemDetailsToModal(viewBtn.dataset.id);
        } else if (copyBtn) {
            const id = copyBtn.dataset.id;
            const itemToCopy = localSavedItems.find(i => i.id === id);
            if (itemToCopy) {
                try {
                    const newInputs = JSON.parse(JSON.stringify(itemToCopy.inputs || {}));
                    newInputs.name = (newInputs.name || 'Dự án') + ' (Bản sao)';
    
                    const newItemData = {
                        inputs: newInputs,
                        finalPrices: JSON.parse(JSON.stringify(itemToCopy.finalPrices || null)),
                        createdAt: serverTimestamp()
                    };
    
                    await addDoc(savedItemsCollectionRef, newItemData);
                    showToast('Sao chép dự án thành công!', 'success');
                } catch (error) {
                    showToast('Lỗi khi sao chép dự án.', 'error');
                    console.error("Error copying item:", error);
                }
            }
        } else if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa dự án này?');
            if (confirmed) {
                try {
                    await deleteDoc(doc(db, `users/${currentUserId}/savedItems`, id));
                    showToast('Xóa dự án thành công.', 'success');
                } catch(error) {
                    showToast('Lỗi khi xoá dự án.', 'error');
                    console.error("Error deleting saved item:", error);
                }
            }
        }
    });

    if (DOM.savedItemsFilterInput) {
        DOM.savedItemsFilterInput.addEventListener('input', debounce(() => {
            siCurrentPage = 1;
            displaySavedItems();
        }, 300));
    }

    if (DOM.siPrevPageBtn) {
        DOM.siPrevPageBtn.addEventListener('click', () => {
            if (siCurrentPage > 1) {
                siCurrentPage--;
                displaySavedItems();
            }
        });
    }

    if (DOM.siNextPageBtn) {
        DOM.siNextPageBtn.addEventListener('click', () => {
            const totalPages = parseInt(DOM.savedItemsPaginationControls.dataset.totalPages, 10) || 1;
            if (siCurrentPage < totalPages) {
                siCurrentPage++;
                displaySavedItems();
            }
        });
    }

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