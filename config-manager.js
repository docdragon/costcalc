// config-manager.js
import { 
    db, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc
} from './firebase.js';

import { 
    showConfirm, showToast, initializeCombobox, debounce, createPaginator
} from './ui.js';
import * as DOM from './dom.js';
import { h } from './utils.js';

// --- Module State ---
let currentUserId = null;
let onUpdateCallback = () => {};

let componentNamesCollectionRef = null;
let productTypesCollectionRef = null;
let componentGroupsCollectionRef = null;

let unsubscribeComponentNames = null; 
let unsubscribeProductTypes = null;
let unsubscribeComponentGroups = null;

let localComponentNames = [];

let cnPaginator;
let renderProductTypes, renderComponentGroups;

// --- Listeners ---
function listenForComponentNames() {
    if (unsubscribeComponentNames) unsubscribeComponentNames();
    unsubscribeComponentNames = onSnapshot(componentNamesCollectionRef, snapshot => {
        localComponentNames = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        localComponentNames.sort((a,b) => a.name.localeCompare(b.name, 'vi'));
        
        onUpdateCallback({ componentNames: localComponentNames });
        displayComponentNames();

        const componentNameOptions = localComponentNames.map(c => ({ id: c.id, name: c.name }));
        if (DOM.ptComponentAddCombobox?.updateComboboxData) DOM.ptComponentAddCombobox.updateComboboxData(componentNameOptions);
        if (DOM.cgComponentAddCombobox?.updateComboboxData) DOM.cgComponentAddCombobox.updateComboboxData(componentNameOptions);

    }, console.error);
}

function listenForProductTypes() {
    if (unsubscribeProductTypes) unsubscribeProductTypes();
    unsubscribeProductTypes = onSnapshot(productTypesCollectionRef, snapshot => {
        const localProductTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdateCallback({ productTypes: localProductTypes });
        if(renderProductTypes) renderProductTypes(localProductTypes);
    }, console.error);
}

function listenForComponentGroups() {
    if (unsubscribeComponentGroups) unsubscribeComponentGroups();
    unsubscribeComponentGroups = onSnapshot(componentGroupsCollectionRef, snapshot => {
        const localComponentGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onUpdateCallback({ componentGroups: localComponentGroups });
        if(renderComponentGroups) renderComponentGroups(localComponentGroups);
    }, console.error);
}


// --- Component Name Management ---
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

function resetComponentNameForm() {
    DOM.componentNameForm.reset();
    DOM.componentNameForm['component-name-id'].value = '';
    DOM.componentLengthFormulaInput.value = '';
    DOM.componentWidthFormulaInput.value = '';
    DOM.componentNameForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Tên';
    DOM.cancelComponentNameEditBtn.classList.add('hidden');
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
}

// --- Product Types & Component Groups Management ---
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
                    await updateDoc(doc(collectionRef(), id), { name });
                    showToast(`Cập nhật ${itemTypeName} thành công!`, 'success');
                } else {
                    const docRef = await addDoc(collectionRef(), { name, components: [] });
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
                    await deleteDoc(doc(collectionRef(), id));
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
            
            await updateDoc(doc(collectionRef(), item.id), { components: newComponents });
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
                await updateDoc(doc(collectionRef(), item.id), { components: newComponents });
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


function initializeConfigTabManagement() {
     renderProductTypes = createConfigManager({
        collectionRef: () => productTypesCollectionRef,
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
        collectionRef: () => componentGroupsCollectionRef,
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

    // Initialize Comboboxes for the config tab
    initializeCombobox(DOM.ptComponentAddCombobox, [], null, { placeholder: "Tìm chi tiết để thêm..." });
    initializeCombobox(DOM.cgComponentAddCombobox, [], null, { placeholder: "Tìm chi tiết để thêm..." });
}


// --- Public API ---
export function initializeConfigurationTab(userId, onDataUpdate) {
    if (!userId) return;
    currentUserId = userId;
    onUpdateCallback = onDataUpdate;

    componentNamesCollectionRef = collection(db, `users/${currentUserId}/componentNames`);
    productTypesCollectionRef = collection(db, `users/${currentUserId}/productTypes`);
    componentGroupsCollectionRef = collection(db, `users/${currentUserId}/componentGroups`);
    
    initializeComponentNameManagement();
    initializeConfigTabManagement();
    
    // Start listeners
    listenForComponentNames();
    listenForProductTypes();
    listenForComponentGroups();
}

export function stopConfigurationListeners() {
    if (unsubscribeComponentNames) {
        unsubscribeComponentNames();
        unsubscribeComponentNames = null;
    }
    if (unsubscribeProductTypes) {
        unsubscribeProductTypes();
        unsubscribeProductTypes = null;
    }
    if (unsubscribeComponentGroups) {
        unsubscribeComponentGroups();
        unsubscribeComponentGroups = null;
    }
}