// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut, setDoc
} from './firebase.js';

import { 
    openModal, closeModal, showConfirm, showToast, updateUIVisibility, 
    initializeImageUploader, initializeTabs, initializeModals, initializeMathInput,
    initializeCombobox, debounce, initializeNumberInputFormatting, createPaginator
} from './ui.js';
import { initializeQuickCalc, updateQuickCalcMaterials } from './quick-calc.js';
import * as DOM from './dom.js';
import { 
    initializeCalculator, updateCalculatorData, setUploadedImage,
    loadItemIntoForm, clearCalculatorInputs, getCalculatorStateForSave,
    loadComponentsByProductType
} from './calculator.js';
import { parseNumber, h, formatDate } from './utils.js';


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
let currentEditingItemId = null;

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
        
        const dataForCalc = { userId: currentUserId };
        updateCalculatorData(dataForCalc);
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
    displayMaterials();
    displaySavedItems();
    displayComponentNames();
    if (renderProductTypes) renderProductTypes([]);
    if (renderComponentGroups) renderComponentGroups([]);
    populateComboboxes();
    updateQuickCalcMaterials(localMaterials);
}

DOM.logoutBtn.addEventListener('click', () => signOut(auth));


// --- Materials Management ---
let materialsPaginator;

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

function getFilteredAndSortedMaterials() {
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
    return materialsToProcess;
}

function displayMaterials(currentPage = 1) {
    const filtered = getFilteredAndSortedMaterials();
    const startIndex = (currentPage - 1) * 10;
    const paginatedItems = filtered.slice(startIndex, startIndex + 10);
    renderMaterials(paginatedItems);
    if (materialsPaginator) materialsPaginator.update(filtered.length);
}

function renderMaterials(materials) {
    DOM.materialsTableBody.innerHTML = '';
    if (materials.length === 0) {
        const emptyRow = h('tr', {}, h('td', { colSpan: 5, style: 'text-align: center; padding: 1rem; color: var(--text-light);' }, 'Không tìm thấy vật tư nào.'));
        DOM.materialsTableBody.appendChild(emptyRow);
        return;
    }
    materials.forEach(m => {
        const tr = h('tr', {},
            h('td', { dataset: { label: 'Tên' } }, m.name),
            h('td', { dataset: { label: 'Loại' } }, h('span', { className: 'tag-type' }, m.type)),
            h('td', { dataset: { label: 'Đơn giá' } }, `${Number(m.price).toLocaleString('vi-VN')}đ / ${m.unit}`),
            h('td', { dataset: { label: 'Ghi chú' } }, m.notes || ''),
            h('td', { dataset: { label: 'Thao tác' }, className: 'text-center' },
                h('button', { className: 'edit-btn text-blue-500 hover:text-blue-700 mr-2', dataset: { id: m.id } }, h('i', { className: 'fas fa-edit' })),
                h('button', { className: 'delete-btn text-red-500 hover:text-red-700', dataset: { id: m.id } }, h('i', { className: 'fas fa-trash' }))
            )
        );
        DOM.materialsTableBody.appendChild(tr);
    });
}

function initializeMaterialsManagement() {
    materialsPaginator = createPaginator({
        controlsEl: DOM.paginationControls,
        pageInfoEl: DOM.pageInfo,
        prevBtn: DOM.prevPageBtn,
        nextBtn: DOM.nextPageBtn,
        itemsPerPage: 10,
        onPageChange: (page) => displayMaterials(page)
    });

    DOM.materialFilterInput.addEventListener('input', debounce(() => { materialsPaginator.reset(); displayMaterials(1); }, 300));
    DOM.materialSortSelect.addEventListener('change', () => { materialsPaginator.reset(); displayMaterials(1); });

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
                DOM.materialForm['material-price'].value = material.price.toString().replace('.', ',');
                DOM.materialForm['material-unit'].value = material.unit;
                DOM.materialForm['material-notes'].value = material.notes || '';
                DOM.materialForm.querySelector('button[type="submit"]').textContent = 'Cập nhật Vật tư';
                DOM.cancelEditBtn.classList.remove('hidden');
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
}


// --- Component Name Management (Configuration Tab) ---
let cnPaginator;

function listenForComponentNames() {
    if (unsubscribeComponentNames) unsubscribeComponentNames();
    unsubscribeComponentNames = onSnapshot(componentNamesCollectionRef, snapshot => {
        localComponentNames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localComponentNames.sort((a,b) => a.name.localeCompare(b.name, 'vi'));
        
        updateCalculatorData({ componentNames: localComponentNames });
        displayComponentNames();

        const componentNameOptions = localComponentNames.map(c => ({ id: c.id, name: c.name }));
        if (DOM.ptComponentAddCombobox?.updateComboboxData) DOM.ptComponentAddCombobox.updateComboboxData(componentNameOptions);
        if (DOM.cgComponentAddCombobox?.updateComboboxData) DOM.cgComponentAddCombobox.updateComboboxData(componentNameOptions);

    }, console.error);
}

function getFilteredComponentNames() {
    let namesToProcess = [...localComponentNames];
    const filterText = DOM.cnFilterInput ? DOM.cnFilterInput.value.toLowerCase().trim() : '';
    if (filterText) {
        namesToProcess = namesToProcess.filter(cn => cn.name.toLowerCase().includes(filterText));
    }
    return namesToProcess;
}

function displayComponentNames(currentPage = 1) {
    const filtered = getFilteredComponentNames();
    const startIndex = (currentPage - 1) * 10;
    const paginatedItems = filtered.slice(startIndex, startIndex + 10);
    renderComponentNames(paginatedItems);
    if(cnPaginator) cnPaginator.update(filtered.length);
}

function renderComponentNames(names) {
    DOM.componentNamesTableBody.innerHTML = '';
    if (names.length === 0) {
        DOM.componentNamesTableBody.appendChild(h('tr', {}, h('td', { colSpan: 8, style: 'text-align: center; padding: 1rem; color: var(--text-light);' }, 'Không tìm thấy tên chi tiết nào.')));
        return;
    }
    names.forEach(cn => {
        const tr = h('tr', {},
            h('td', { dataset: { label: 'Tên' } }, cn.name),
            h('td', { dataset: { label: 'CT Dài' } }, cn.lengthFormula || '-'),
            h('td', { dataset: { label: 'CT Rộng' } }, cn.widthFormula || '-'),
            h('td', { dataset: { label: 'D1' }, className: 'text-center' }, h('div', { className: `edge-banding-icon ${cn.edge1 ? 'on' : 'off'}` }, h('i', { className: 'fas fa-check' }))),
            h('td', { dataset: { label: 'D2' }, className: 'text-center' }, h('div', { className: `edge-banding-icon ${cn.edge2 ? 'on' : 'off'}` }, h('i', { className: 'fas fa-check' }))),
            h('td', { dataset: { label: 'R1' }, className: 'text-center' }, h('div', { className: `edge-banding-icon ${cn.edge3 ? 'on' : 'off'}` }, h('i', { className: 'fas fa-check' }))),
            h('td', { dataset: { label: 'R2' }, className: 'text-center' }, h('div', { className: `edge-banding-icon ${cn.edge4 ? 'on' : 'off'}` }, h('i', { className: 'fas fa-check' }))),
            h('td', { dataset: { label: 'Thao tác' }, className: 'text-center' },
                h('button', { className: 'edit-cn-btn text-blue-500 hover:text-blue-700 mr-2', dataset: { id: cn.id } }, h('i', { className: 'fas fa-edit' })),
                h('button', { className: 'delete-cn-btn text-red-500 hover:text-red-700', dataset: { id: cn.id } }, h('i', { className: 'fas fa-trash' }))
            )
        );
        DOM.componentNamesTableBody.appendChild(tr);
    });
}

function initializeComponentNameManagement() {
    cnPaginator = createPaginator({
        controlsEl: DOM.cnPaginationControls,
        pageInfoEl: DOM.cnPageInfo,
        prevBtn: DOM.cnPrevPageBtn,
        nextBtn: DOM.cnNextPageBtn,
        itemsPerPage: 10,
        onPageChange: page => displayComponentNames(page)
    });

    if (DOM.cnFilterInput) {
        DOM.cnFilterInput.addEventListener('input', debounce(() => {
            cnPaginator.reset();
            displayComponentNames(1);
        }, 300));
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
}


// --- Configuration Tab: Product Types & Component Groups (Refactored) ---
function createConfigManager(config) {
    let currentEditingId = null;
    let localItems = [];

    const {
        collectionRef, formEl, idInput, nameInput, cancelBtn, listEl, editorEl, editorTitleEl,
        itemTypeName, componentAddCombobox, componentAddQtyInput, componentAddBtn, componentsListEl
    } = config;

    function renderList() {
        listEl.innerHTML = '';
        if (localItems.length === 0) {
            listEl.appendChild(h('p', { className: 'form-text' }, `Chưa có ${itemTypeName} nào.`));
            return;
        }
        localItems.forEach(item => {
            const itemEl = h('div', {
                className: `config-list-item ${item.id === currentEditingId ? 'active' : ''}`,
                dataset: { id: item.id }
            },
                h('span', {}, item.name),
                h('div', { className: 'config-list-item-actions' },
                    h('button', {
                        className: 'delete-btn',
                        dataset: { id: item.id },
                        title: `Xóa ${itemTypeName}`
                    }, h('i', { className: 'fas fa-trash' }))
                )
            );
            listEl.appendChild(itemEl);
        });
    }
    
    function renderEditor() {
        const item = localItems.find(i => i.id === currentEditingId);
        if (!item) {
            editorEl.classList.add('hidden');
            return;
        }
        editorEl.classList.remove('hidden');
        editorTitleEl.textContent = `Chỉnh sửa chi tiết cho: ${item.name}`;
        
        componentsListEl.innerHTML = '';
        const components = item.components || [];
        if (components.length > 0) {
            components.forEach(c => {
                const componentName = localComponentNames.find(cn => cn.id === c.componentNameId)?.name || 'Không rõ';
                const tr = h('tr', { dataset: { cnid: c.componentNameId } },
                    h('td', { dataset: { label: 'Tên' } }, componentName),
                    h('td', { dataset: { label: 'Số lượng' }, className: 'text-center' }, c.qty),
                    h('td', { dataset: { label: 'Xóa' }, className: 'text-center' },
                        h('button', { className: 'remove-component-btn', dataset: { cnid: c.componentNameId } }, h('i', { className: 'fas fa-trash' }))
                    )
                );
                componentsListEl.appendChild(tr);
            });
        } else {
            componentsListEl.appendChild(h('tr', {}, h('td', { colSpan: 3, className: 'text-center', style: 'padding: 1rem; color: var(--text-light)' }, 'Chưa có chi tiết nào.')));
        }
    }

    function resetForm() {
        formEl.reset();
        idInput.value = '';
        formEl.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Mới';
        cancelBtn.classList.add('hidden');
    }

    function attachListeners() {
        formEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = nameInput.value.trim();
            if (!name || !currentUserId) return;
            const id = idInput.value;
            try {
                if (id) {
                    await updateDoc(doc(collectionRef, id), { name });
                    showToast(`Cập nhật ${itemTypeName} thành công!`, 'success');
                } else {
                    const docRef = await addDoc(collectionRef, { name, components: [] });
                    showToast(`Thêm ${itemTypeName} thành công!`, 'success');
                    currentEditingId = docRef.id;
                }
                resetForm();
                renderList();
                renderEditor();
            } catch (error) { showToast('Đã có lỗi xảy ra.', 'error'); }
        });

        listEl.addEventListener('click', async e => {
            const itemEl = e.target.closest('.config-list-item');
            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                const id = deleteBtn.dataset.id;
                const item = localItems.find(i => i.id === id);
                const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${itemTypeName} "${item.name}"?`);
                if (confirmed) {
                    await deleteDoc(doc(collectionRef, id));
                    if (currentEditingId === id) {
                        currentEditingId = null;
                        editorEl.classList.add('hidden');
                    }
                    showToast("Xóa thành công", "success");
                }
            } else if (itemEl) {
                currentEditingId = itemEl.dataset.id;
                const item = localItems.find(i => i.id === currentEditingId);
                if (item) {
                    idInput.value = item.id;
                    nameInput.value = item.name;
                    formEl.querySelector('button[type="submit"]').textContent = 'Cập nhật';
                    cancelBtn.classList.remove('hidden');
                }
                renderList();
                renderEditor();
            }
        });

        cancelBtn.addEventListener('click', () => {
            resetForm();
            currentEditingId = null;
            renderList();
            editorEl.classList.add('hidden');
        });

        componentAddBtn.addEventListener('click', async () => {
            const item = localItems.find(i => i.id === currentEditingId);
            if (!item) return;
            const componentNameId = componentAddCombobox.querySelector('.combobox-value').value;
            const qty = parseInt(componentAddQtyInput.value);
            if (!componentNameId || !qty || qty < 1) {
                showToast('Vui lòng chọn chi tiết và nhập số lượng hợp lệ.', 'error');
                return;
            }
            const newComponents = JSON.parse(JSON.stringify(item.components || []));
            const existing = newComponents.find(c => c.componentNameId === componentNameId);
            if (existing) existing.qty = qty;
            else newComponents.push({ componentNameId, qty });
            
            await updateDoc(doc(collectionRef, item.id), { components: newComponents });
            showToast('Đã thêm/cập nhật chi tiết.', 'success');
            componentAddQtyInput.value = '1';
            if (componentAddCombobox.setValue) componentAddCombobox.setValue('');
        });

        componentsListEl.addEventListener('click', async e => {
            const deleteBtn = e.target.closest('.remove-component-btn');
            if (deleteBtn) {
                const item = localItems.find(i => i.id === currentEditingId);
                if (!item) return;
                const componentNameIdToRemove = deleteBtn.dataset.cnid;
                const newComponents = (item.components || []).filter(c => c.componentNameId !== componentNameIdToRemove);
                await updateDoc(doc(collectionRef, item.id), { components: newComponents });
                showToast('Đã xóa chi tiết.', 'success');
            }
        });
    }
    
    attachListeners();

    return (newItems) => {
        localItems = (newItems || []).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        renderList();
        if (currentEditingId) renderEditor();
    };
}

let renderProductTypes, renderComponentGroups;

function listenForProductTypes() {
    if (unsubscribeProductTypes) unsubscribeProductTypes();
    unsubscribeProductTypes = onSnapshot(productTypesCollectionRef, snapshot => {
        localProductTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateCalculatorData({ productTypes: localProductTypes });
        if(renderProductTypes) renderProductTypes(localProductTypes);
        populateProductTypeDropdown();
    }, console.error);
}

function listenForComponentGroups() {
    if (unsubscribeComponentGroups) unsubscribeComponentGroups();
    unsubscribeComponentGroups = onSnapshot(componentGroupsCollectionRef, snapshot => {
        localComponentGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateCalculatorData({ componentGroups: localComponentGroups });
        if(renderComponentGroups) renderComponentGroups(localComponentGroups);
        if (DOM.addGroupCombobox?.updateComboboxData) {
            DOM.addGroupCombobox.updateComboboxData(localComponentGroups);
        }
    }, console.error);
}

function initializeConfigTabManagement() {
     renderProductTypes = createConfigManager({
        collectionRef: productTypesCollectionRef,
        formEl: DOM.productTypeForm,
        idInput: DOM.productTypeIdInput,
        nameInput: DOM.productTypeNameInput,
        cancelBtn: DOM.cancelProductTypeEditBtn,
        listEl: DOM.productTypesList,
        editorEl: DOM.productTypeEditor,
        editorTitleEl: DOM.productTypeEditorTitle,
        itemTypeName: 'loại sản phẩm',
        componentAddCombobox: DOM.ptComponentAddCombobox,
        componentAddQtyInput: DOM.ptComponentAddQtyInput,
        componentAddBtn: DOM.ptComponentAddBtn,
        componentsListEl: DOM.ptComponentsList,
    });
    
    renderComponentGroups = createConfigManager({
        collectionRef: componentGroupsCollectionRef,
        formEl: DOM.componentGroupForm,
        idInput: DOM.componentGroupIdInput,
        nameInput: DOM.componentGroupNameInput,
        cancelBtn: DOM.cancelComponentGroupEditBtn,
        listEl: DOM.componentGroupsList,
        editorEl: DOM.componentGroupEditor,
        editorTitleEl: DOM.componentGroupEditorTitle,
        itemTypeName: 'nhóm chi tiết',
        componentAddCombobox: DOM.cgComponentAddCombobox,
        componentAddQtyInput: DOM.cgComponentAddQtyInput,
        componentAddBtn: DOM.cgComponentAddBtn,
        componentsListEl: DOM.cgComponentsList,
    });
}


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
    if (DOM.addGroupCombobox?.updateComboboxData) DOM.addGroupCombobox.updateComboboxData(localComponentGroups);
}


// --- Saved Items Management ---
let savedItemsPaginator;

function listenForSavedItems() {
    if (unsubscribeSavedItems) unsubscribeSavedItems();
    unsubscribeSavedItems = onSnapshot(savedItemsCollectionRef, snapshot => {
        localSavedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displaySavedItems();
    }, console.error);
}

function getFilteredSavedItems() {
     let itemsToProcess = [...localSavedItems];
    const filterText = DOM.savedItemsFilterInput ? DOM.savedItemsFilterInput.value.toLowerCase().trim() : '';
    if (filterText) {
        itemsToProcess = itemsToProcess.filter(item => {
            const inputs = item.inputs || {};
            const name = (inputs.name || '').toLowerCase();
            const description = (inputs.description || '').toLowerCase();
            if (name.includes(filterText) || description.includes(filterText)) return true;

            const usedMaterialIds = new Set([
                inputs.mainWoodId, inputs.backPanelId, inputs.edgeMaterialId,
                ...(inputs.accessories || []).map(a => a.id),
                ...(inputs.components || []).map(c => c.materialId)
            ].filter(Boolean));

            return [...usedMaterialIds].some(id => {
                const material = allLocalMaterials.find(m => m.id === id);
                return material && (
                    (material.name || '').toLowerCase().includes(filterText) ||
                    (material.notes || '').toLowerCase().includes(filterText)
                );
            });
        });
    }
    itemsToProcess.sort((a, b) => (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0));
    return itemsToProcess;
}

function displaySavedItems(currentPage = 1) {
    const filtered = getFilteredSavedItems();
    const startIndex = (currentPage - 1) * 5;
    const paginatedItems = filtered.slice(startIndex, startIndex + 5);
    renderSavedItems(paginatedItems);
    if(savedItemsPaginator) savedItemsPaginator.update(filtered.length);
}

function renderSavedItems(items) {
    DOM.savedItemsTableBody.innerHTML = '';
    if (items.length === 0) {
        DOM.savedItemsTableBody.appendChild(h('tr', {}, h('td', { colSpan: 6, style: 'text-align: center; padding: 1rem; color: var(--text-light);' }, 'Không tìm thấy dự án nào.')));
        return;
    }
    items.forEach(item => {
        const { inputs = {}, finalPrices = {} } = item;
        const itemName = inputs.name || 'Dự án không tên';
        const createdAt = item?.createdAt ? formatDate(item.createdAt.toDate()) : 'Không rõ';
        const { suggestedPrice = 0, totalCost = 0, estimatedProfit = 0 } = finalPrices;

        const dims = (inputs.length && inputs.width && inputs.height) ? `${inputs.length} x ${inputs.width} x ${inputs.height} mm` : 'Không rõ kích thước';
        const mainWoodName = allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Chưa chọn ván';

        const tr = h('tr', {},
            h('td', { dataset: { label: 'Tên & Chi tiết Dự án' } },
                h('div', { className: 'project-name-main' }, itemName),
                h('div', { className: 'project-details-list' },
                    h('span', { className: 'project-detail-item' }, h('i', { className: 'fas fa-fw fa-ruler-combined' }), ` ${dims}`),
                    h('span', { className: 'project-detail-item' }, h('i', { className: 'fas fa-fw fa-layer-group' }), ` ${mainWoodName}`)
                ),
                inputs.description ? h('p', { className: 'project-description' }, inputs.description) : null
            ),
            h('td', { dataset: { label: 'Giá Bán' }, className: 'font-semibold' }, `${suggestedPrice.toLocaleString('vi-VN')}đ`),
            h('td', { dataset: { label: 'Chi Phí' } }, `${totalCost.toLocaleString('vi-VN')}đ`),
            h('td', { dataset: { label: 'Lợi Nhuận' } }, `${estimatedProfit.toLocaleString('vi-VN')}đ`),
            h('td', { dataset: { label: 'Ngày tạo' } }, createdAt),
            h('td', { dataset: { label: 'Thao tác' }, className: 'text-center' },
                h('button', { className: 'load-btn text-green-500 hover:text-green-700 mr-2', dataset: { id: item.id }, title: 'Tải lại dự án này' }, h('i', { className: 'fas fa-upload' })),
                h('button', { className: 'view-btn text-blue-500 hover:text-blue-700 mr-2', dataset: { id: item.id }, title: 'Xem chi tiết' }, h('i', { className: 'fas fa-eye' })),
                h('button', { className: 'copy-btn text-purple-500 hover:text-purple-700 mr-2', dataset: { id: item.id }, title: 'Sao chép dự án' }, h('i', { className: 'fas fa-copy' })),
                h('button', { className: 'delete-saved-item-btn text-red-500 hover:text-red-700', dataset: { id: item.id }, title: 'Xóa dự án' }, h('i', { className: 'fas fa-trash' }))
            )
        );
        DOM.savedItemsTableBody.appendChild(tr);
    });
}

function renderItemDetailsToModal(itemId) {
    const item = localSavedItems.find(i => i.id === itemId);
    if (!item) return;

    const { inputs = {}, finalPrices = {} } = item;
    const { costBreakdown = [], suggestedPrice = 0, totalCost = 0, estimatedProfit = 0 } = finalPrices;
    
    DOM.viewItemTitle.textContent = `Chi tiết dự án: ${inputs.name || 'Không tên'}`;
    const mainWood = allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Không rõ';
    const backPanel = allLocalMaterials.find(m => m.id === inputs.backPanelId)?.name || 'Dùng ván chính';
    
    const accessoriesList = (inputs.accessories && inputs.accessories.length > 0)
        ? h('ul', {}, ...inputs.accessories.map(a => h('li', {}, `${a.name} (SL: ${a.quantity} ${a.unit})`)))
        : h('p', {}, 'Không có phụ kiện nào.');
    
    const breakdownList = (costBreakdown.length > 0)
        ? h('ul', { className: 'cost-list' }, ...costBreakdown.map(item =>
            h('li', {},
                h('span', { className: 'cost-item-name' }, item.name),
                h('span', { className: 'cost-item-value' }, `${(Math.round(item.cost || 0)).toLocaleString('vi-VN')}đ`),
                item.reason ? h('p', { className: 'cost-item-reason' }, item.reason) : null
            )))
        : h('p', {}, 'Không có phân tích chi phí.');
    
    DOM.viewItemContent.innerHTML = '';
    DOM.viewItemContent.append(
        h('div', { className: 'final-price-recommendation' },
            h('div', { className: 'final-price-main' },
                h('div', { className: 'final-price-label' }, 'Giá Bán Đề Xuất'),
                h('div', { className: 'final-price-value' }, `${suggestedPrice.toLocaleString('vi-VN')}đ`)
            ),
            h('div', { className: 'final-price-breakdown' },
                h('div', {}, h('span', { className: 'breakdown-label' }, 'Tổng Chi Phí'), h('span', { className: 'breakdown-value' }, `${totalCost.toLocaleString('vi-VN')}đ`)),
                h('div', {}, h('span', { className: 'breakdown-label' }, 'Lợi Nhuận'), h('span', { className: 'breakdown-value' }, `${estimatedProfit.toLocaleString('vi-VN')}đ`)),
                h('div', {}, h('span', { className: 'breakdown-label' }, 'Biên Lợi Nhuận'), h('span', { className: 'breakdown-value' }, `${inputs.profitMargin || 'N/A'}%`))
            )
        ),
        h('div', { className: 'modal-details-grid' },
            h('div', { className: 'modal-details-col' },
                h('h4', {}, h('i', { className: 'fas fa-ruler-combined' }), 'Thông số & Vật tư chính'),
                h('ul', {},
                    h('li', {}, h('strong', {}, 'Mô tả: '), inputs.description || 'Không có'),
                    h('li', {}, h('strong', {}, 'Kích thước (D x R x C): '), `${inputs.length || 'N/A'} x ${inputs.width || 'N/A'} x ${inputs.height || 'N/A'} mm`),
                    h('li', {}, h('strong', {}, 'Ván chính: '), mainWood),
                    h('li', {}, h('strong', {}, 'Ván hậu: '), backPanel),
                    h('li', {}, h('strong', {}, 'Chi phí nhân công: '), `${(parseNumber(inputs.laborCost) || 0).toLocaleString('vi-VN')}đ`)
                ),
                h('h4', {}, h('i', { className: 'fas fa-cogs' }), 'Phụ kiện & Vật tư khác'),
                accessoriesList
            ),
            h('div', { className: 'modal-details-col' },
                 h('h3', { className: 'result-box-header' }, h('i', { className: 'fas fa-file-invoice-dollar' }), ' Phân tích Chi phí Vật tư'),
                 breakdownList
            )
        )
    );
    openModal(DOM.viewItemModal);
}

function initializeSavedItemsManagement() {
    savedItemsPaginator = createPaginator({
        controlsEl: DOM.savedItemsPaginationControls,
        pageInfoEl: DOM.siPageInfo,
        prevBtn: DOM.siPrevPageBtn,
        nextBtn: DOM.siNextPageBtn,
        itemsPerPage: 5,
        onPageChange: page => displaySavedItems(page)
    });

    if (DOM.savedItemsFilterInput) {
        DOM.savedItemsFilterInput.addEventListener('input', debounce(() => {
            savedItemsPaginator.reset();
            displaySavedItems(1);
        }, 300));
    }

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
                }
            }
        }
    });
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
    initializeNumberInputFormatting('input[inputmode="decimal"]');
    
    // Initialize all modules
    initializeCalculator();
    initializeQuickCalc(localMaterials, showToast);
    initializeMaterialsManagement();
    initializeComponentNameManagement();
    initializeConfigTabManagement();
    initializeSavedItemsManagement();
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
            DOM.clearFormBtn.click();
        } catch (error) {
            showToast('Lỗi khi lưu dự án.', 'error');
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
        }
    });
    
    DOM.clearFormBtn.addEventListener('click', () => {
        clearCalculatorInputs();
        currentEditingItemId = null;
        updateCalculatorActionButtons();
        showToast('Đã xóa biểu mẫu. Sẵn sàng cho dự án mới.', 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});
