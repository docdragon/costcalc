// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut
} from './firebase.js';

import { 
    openModal, closeModal, showConfirm, showToast, updateUIVisibility, 
    initializeTabs, initializeModals, 
    initializeNumberInputFormatting, createPaginator, debounce, initializeMathInput
} from './ui.js';
import { initializeQuickCalc, updateQuickCalcMaterials } from './quick-calc.js';
import * as DOM from './dom.js';
import { 
    initializeCalculator, updateCalculatorData,
    loadItemIntoForm, clearCalculatorInputs, getCalculatorStateForSave,
    loadComponentsByProductType
} from './calculator.js';
import { initializeConfigurationTab, stopConfigurationListeners } from './config-manager.js';
import { parseNumber, h, formatDate } from './utils.js';


// --- Global State ---
const appState = {
    currentUserId: null,
    materialsCollectionRef: null,
    savedItemsCollectionRef: null,
    
    unsubscribeMaterials: null, 
    unsubscribeSavedItems: null,

    // Local data stores
    localMaterials: { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] },
    allLocalMaterials: [],
    localSavedItems: [],
    localComponentNames: [],
    localProductTypes: [],
    localComponentGroups: [],
    
    currentEditingItemId: null
};


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
        appState.currentUserId = user.uid;
        appState.materialsCollectionRef = collection(db, `users/${appState.currentUserId}/materials`);
        appState.savedItemsCollectionRef = collection(db, `users/${appState.currentUserId}/savedItems`);
        
        const dataForCalc = { userId: appState.currentUserId };
        updateCalculatorData(dataForCalc);
        await checkAndAddSampleData(appState.currentUserId);
        
        initializeConfigurationTab(appState.currentUserId, (updates) => {
            if (updates.componentNames) {
                appState.localComponentNames = updates.componentNames;
                updateCalculatorData({ componentNames: appState.localComponentNames });
            }
            if (updates.productTypes) {
                appState.localProductTypes = updates.productTypes;
                updateCalculatorData({ productTypes: appState.localProductTypes });
                populateProductTypeDropdown();
            }
            if (updates.componentGroups) {
                appState.localComponentGroups = updates.componentGroups;
                updateCalculatorData({ componentGroups: appState.localComponentGroups });
                if (DOM.addGroupCombobox?.updateComboboxData) {
                    DOM.addGroupCombobox.updateComboboxData(appState.localComponentGroups);
                }
            }
        });
        
        listenForData();
    } else {
        appState.currentUserId = null;
        if (appState.unsubscribeMaterials) appState.unsubscribeMaterials();
        if (appState.unsubscribeSavedItems) appState.unsubscribeSavedItems();
        stopConfigurationListeners();
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
}

function clearLocalData() {
    appState.localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [], 'Gia Công': [] };
    appState.allLocalMaterials = [];
    appState.localSavedItems = [];
    appState.localComponentNames = [];
    appState.localProductTypes = [];
    appState.localComponentGroups = [];
    displayMaterials();
    displaySavedItems();
    populateComboboxes();
    updateQuickCalcMaterials(appState.localMaterials);
}

DOM.logoutBtn.addEventListener('click', () => signOut(auth));


// --- Materials Management ---
let materialsPaginator;

function listenForMaterials() {
    if (appState.unsubscribeMaterials) appState.unsubscribeMaterials(); 
    appState.unsubscribeMaterials = onSnapshot(appState.materialsCollectionRef, snapshot => {
        appState.localMaterials['Ván'] = [];
        appState.localMaterials['Cạnh'] = [];
        appState.localMaterials['Phụ kiện'] = [];
        appState.localMaterials['Gia Công'] = [];
        
        snapshot.docs.forEach(doc => {
            const material = { id: doc.id, ...doc.data() };
            if (appState.localMaterials[material.type]) {
                appState.localMaterials[material.type].push(material);
            }
        });

        appState.allLocalMaterials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        updateCalculatorData({ materials: appState.localMaterials, allMaterials: appState.allLocalMaterials });
        displayMaterials(); 
        populateComboboxes();
        updateQuickCalcMaterials(appState.localMaterials);
    }, console.error);
}

function getFilteredAndSortedMaterials() {
    let materialsToProcess = [...appState.allLocalMaterials];
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
        if (!appState.currentUserId) return;
        
        const price = parseNumber(DOM.materialForm['material-price'].value);
        if (isNaN(price)) {
            showToast('Giá tiền không hợp lệ. Vui lòng nhập một số.', 'error');
            return;
        }

        const materialData = {
            name: DOM.materialForm['material-name'].value,
            type: DOM.materialForm['material-type'].value,
            price: price,
            unit: DOM.materialForm['material-unit'].value,
            notes: DOM.materialForm['material-notes'].value
        };
        const id = DOM.materialForm['material-id'].value;
        try {
            if (id) {
                await updateDoc(doc(db, `users/${appState.currentUserId}/materials`, id), materialData);
                showToast('Cập nhật vật tư thành công!', 'success');
            } else {
                await addDoc(appState.materialsCollectionRef, materialData);
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
            const material = appState.allLocalMaterials.find(m => m.id === id);
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
                    await deleteDoc(doc(db, `users/${appState.currentUserId}/materials`, id));
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


// --- Calculator Action Buttons ---
function updateCalculatorActionButtons() {
    const isEditing = !!appState.currentEditingItemId;
    DOM.saveItemBtn.classList.toggle('hidden', isEditing);
    DOM.updateItemBtn.classList.toggle('hidden', !isEditing);
}


// --- Populate Dropdowns ---
function populateProductTypeDropdown() {
    if (DOM.itemTypeCombobox?.updateComboboxData) {
        DOM.itemTypeCombobox.updateComboboxData(appState.localProductTypes);
    }
}

function populateComboboxes() {
    const allAccessoryMaterials = [ ...appState.localMaterials['Phụ kiện'], ...appState.localMaterials['Gia Công'], ...appState.localMaterials['Cạnh'] ];

    if (DOM.mainMaterialWoodCombobox?.updateComboboxData) DOM.mainMaterialWoodCombobox.updateComboboxData(appState.localMaterials['Ván']);
    if (DOM.mainMaterialBackPanelCombobox?.updateComboboxData) DOM.mainMaterialBackPanelCombobox.updateComboboxData(appState.localMaterials['Ván']);
    if (DOM.addGroupCombobox?.updateComboboxData) DOM.addGroupCombobox.updateComboboxData(appState.localComponentGroups);
}


// --- Saved Items Management ---
let savedItemsPaginator;

function listenForSavedItems() {
    if (appState.unsubscribeSavedItems) appState.unsubscribeSavedItems();
    appState.unsubscribeSavedItems = onSnapshot(appState.savedItemsCollectionRef, snapshot => {
        appState.localSavedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displaySavedItems();
    }, console.error);
}

function getFilteredSavedItems() {
     let itemsToProcess = [...appState.localSavedItems];
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
                const material = appState.allLocalMaterials.find(m => m.id === id);
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
        const mainWoodName = appState.allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Chưa chọn ván';

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
    const item = appState.localSavedItems.find(i => i.id === itemId);
    if (!item) return;

    const { inputs = {}, finalPrices = {} } = item;
    const { costBreakdown = [], suggestedPrice = 0, totalCost = 0, estimatedProfit = 0 } = finalPrices;
    
    DOM.viewItemTitle.textContent = `Chi tiết dự án: ${inputs.name || 'Không tên'}`;
    const mainWood = appState.allLocalMaterials.find(m => m.id === inputs.mainWoodId)?.name || 'Không rõ';
    const backPanel = appState.allLocalMaterials.find(m => m.id === inputs.backPanelId)?.name || 'Dùng ván chính';
    
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
            const itemToLoad = appState.localSavedItems.find(i => i.id === loadBtn.dataset.id);
            if (itemToLoad) {
                appState.currentEditingItemId = itemToLoad.id;
                loadItemIntoForm(itemToLoad);
                updateCalculatorActionButtons();
            }
        } else if (viewBtn) {
            renderItemDetailsToModal(viewBtn.dataset.id);
        } else if (copyBtn) {
            const id = copyBtn.dataset.id;
            const itemToCopy = appState.localSavedItems.find(i => i.id === id);
            if (itemToCopy) {
                try {
                    const newInputs = JSON.parse(JSON.stringify(itemToCopy.inputs || {}));
                    newInputs.name = (newInputs.name || 'Dự án') + ' (Bản sao)';
    
                    const newItemData = {
                        inputs: newInputs,
                        finalPrices: JSON.parse(JSON.stringify(itemToCopy.finalPrices || null)),
                        createdAt: serverTimestamp()
                    };
    
                    await addDoc(appState.savedItemsCollectionRef, newItemData);
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
                    await deleteDoc(doc(db, `users/${appState.currentUserId}/savedItems`, id));
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
    initializeNumberInputFormatting('input[inputmode="decimal"]');
    initializeMathInput('input[inputmode="decimal"]');
    
    // Initialize all modules
    initializeCalculator();
    initializeQuickCalc(appState.localMaterials, showToast);
    initializeMaterialsManagement();
    initializeSavedItemsManagement();
    updateCalculatorActionButtons();

    // Event Listeners for actions that cross module boundaries
    DOM.saveItemBtn.addEventListener('click', async () => {
        const itemDataToSave = getCalculatorStateForSave();
        if (!itemDataToSave) return;
        
        const itemData = { ...itemDataToSave, createdAt: serverTimestamp() };
        try {
            await addDoc(appState.savedItemsCollectionRef, itemData);
            showToast('Lưu dự án thành công!', 'success');
            DOM.clearFormBtn.click();
        } catch (error) {
            showToast('Lỗi khi lưu dự án.', 'error');
        }
    });

    DOM.updateItemBtn.addEventListener('click', async () => {
        if (!appState.currentEditingItemId) {
            showToast('Không có dự án nào đang được chỉnh sửa để cập nhật.', 'error');
            return;
        }
        const itemDataToSave = getCalculatorStateForSave();
        if (!itemDataToSave) return;

        const itemData = { ...itemDataToSave, updatedAt: serverTimestamp() };
        try {
            const itemRef = doc(db, `users/${appState.currentUserId}/savedItems`, appState.currentEditingItemId);
            await updateDoc(itemRef, itemData);
            showToast('Cập nhật dự án thành công!', 'success');
        } catch (error) {
            showToast('Lỗi khi cập nhật dự án.', 'error');
        }
    });
    
    DOM.clearFormBtn.addEventListener('click', () => {
        clearCalculatorInputs();
        appState.currentEditingItemId = null;
        updateCalculatorActionButtons();
        showToast('Đã xóa biểu mẫu. Sẵn sàng cho dự án mới.', 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});