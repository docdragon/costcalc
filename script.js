// script.js
import { 
    db, auth, collection, onSnapshot, addDoc, doc, updateDoc, 
    deleteDoc, serverTimestamp, getDocs, query, limit, onAuthStateChanged, 
    signOut, setDoc, getDoc
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
import { parseNumber, h, formatDate, getGDocsEmbedUrl, formatInputDateToDisplay } from './utils.js';


// --- Global State ---
const appState = {
    currentUserId: null,
    currentUserProfile: null,
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

// --- User Profile Management ---
async function getUserProfile(user) {
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
        // Update last login time on every successful auth
        updateDoc(userDocRef, { lastLoginAt: serverTimestamp() }).catch(console.error);
        return { uid: user.uid, ...userDocSnap.data() };
    } else {
        console.log("Creating new user profile.");
        const usersQuery = query(collection(db, 'users'), limit(1));
        const usersSnapshot = await getDocs(usersQuery);
        const isFirstUser = usersSnapshot.empty;
        
        const newUserProfile = {
            email: user.email,
            displayName: user.displayName,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
            role: isFirstUser ? 'admin' : 'user',
            status: 'active',
            expiresAt: null, // Trial period is not set by default to avoid permission errors on creation. Admin can set it.
        };

        await setDoc(userDocRef, newUserProfile);

        if (isFirstUser) {
            showToast('Chào mừng Admin đầu tiên của CostCraft!', 'success');
        }
        
        await checkAndAddSampleData(user.uid);
        
        return { uid: user.uid, ...newUserProfile };
    }
}

// --- Admin Tab Logic ---
let localUsers = [];
let unsubscribeUsers = null;

function renderUsersTable(usersToRender) {
    if (!DOM.adminUserListTbody) return;
    DOM.adminUserListTbody.innerHTML = '';

    if (usersToRender.length === 0) {
        DOM.adminUserListTbody.appendChild(h('tr', {}, h('td', { colSpan: 6, style: 'text-align: center; padding: 1rem; color: var(--text-light);' }, 'Không tìm thấy người dùng nào.')));
        return;
    }

    usersToRender.forEach(user => {
        const isCurrentUser = user.uid === appState.currentUserId;

        // Role select
        const roleSelect = h('select', { className: 'input-style', dataset: { uid: user.uid, field: 'role' }, disabled: isCurrentUser },
            h('option', { value: 'user', selected: user.role === 'user' }, 'User'),
            h('option', { value: 'admin', selected: user.role === 'admin' }, 'Admin'),
            h('option', { value: 'paid', selected: user.role === 'paid' }, 'Paid'),
            h('option', { value: 'trial', selected: user.role === 'trial' }, 'Trial')
        );

        // Status select
        const statusSelect = h('select', { className: 'input-style', dataset: { uid: user.uid, field: 'status' }, disabled: isCurrentUser },
            h('option', { value: 'active', selected: user.status === 'active' }, 'Hoạt động'),
            h('option', { value: 'disabled', selected: user.status === 'disabled' }, 'Vô hiệu hóa')
        );
        
        // Expiry input
        let statusText;
        if (user.expiresAt === null) {
            statusText = 'Vĩnh viễn';
        } else if (user.expiresAt?.toDate) {
            const expiryDate = user.expiresAt.toDate();
            if (expiryDate < new Date()) {
                statusText = 'Hết hạn';
            } else {
                const remainingDays = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
                statusText = `Còn ${remainingDays} ngày`;
            }
        } else {
            statusText = 'Chưa đặt';
        }

        const expiryInput = h('input', {
            type: 'text',
            className: 'input-style',
            placeholder: "Số ngày hoặc 'vv'",
            dataset: { uid: user.uid, field: 'expiresAt' },
            disabled: isCurrentUser
        });

        const expiryCellContent = h('div', {},
            h('div', { style: 'font-size: 0.8rem; color: var(--text-light); margin-bottom: 0.25rem;' }, statusText),
            expiryInput
        );


        // Last login display
        const lastLogin = user.lastLoginAt?.toDate ? formatDate(user.lastLoginAt.toDate()) : 'Chưa đăng nhập';

        const tr = h('tr', { key: user.uid },
            h('td', { dataset: { label: 'Email' } }, user.email),
            h('td', { dataset: { label: 'Tên hiển thị' } }, user.displayName || '-'),
            h('td', { dataset: { label: 'Vai trò' } }, roleSelect),
            h('td', { dataset: { label: 'Trạng thái' } }, statusSelect),
            h('td', { dataset: { label: 'Thời hạn' } }, expiryCellContent),
            h('td', { dataset: { label: 'Đăng nhập cuối' } }, lastLogin)
        );
        DOM.adminUserListTbody.appendChild(tr);
    });
}

function filterAndRenderUsers() {
    const filterText = DOM.adminUserFilterInput.value.toLowerCase().trim();
    if (!filterText) {
        renderUsersTable(localUsers);
        return;
    }
    const filteredUsers = localUsers.filter(u => 
        (u.email && u.email.toLowerCase().includes(filterText)) || 
        (u.displayName && u.displayName.toLowerCase().includes(filterText))
    );
    renderUsersTable(filteredUsers);
}

async function handleAdminUserUpdate(e) {
    const inputEl = e.target;
    const uid = inputEl.dataset.uid;
    const field = inputEl.dataset.field;

    if (!uid || !field) return;

    const userToUpdate = localUsers.find(u => u.uid === uid);
    if (uid === appState.currentUserId && (field === 'role' || field === 'status')) {
        showToast('Bạn không thể thay đổi vai trò hoặc trạng thái của chính mình.', 'error');
        inputEl.value = userToUpdate[field]; // Revert value
        return;
    }

    let valueToUpdate;
    if (field === 'expiresAt') {
        const newValue = inputEl.value.trim();
        if (!newValue) return; // Ignore if input is empty

        const lowerCaseValue = newValue.toLowerCase();
        if (lowerCaseValue === 'vv' || lowerCaseValue === 'vĩnh viễn') {
            valueToUpdate = null;
        } else {
            const days = parseInt(newValue, 10);
            if (!isNaN(days) && days >= 0) {
                valueToUpdate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
            } else {
                showToast("Vui lòng nhập một số ngày hợp lệ (vd: 30) hoặc 'vv' cho vĩnh viễn.", 'error');
                inputEl.value = ''; // Clear invalid input
                return;
            }
        }
    } else {
        valueToUpdate = inputEl.value;
    }
    
    try {
        await updateDoc(doc(db, 'users', uid), { [field]: valueToUpdate });
        showToast(`Đã cập nhật '${field}' cho ${userToUpdate.email}.`, 'success');
        if (field === 'expiresAt') {
            inputEl.value = ''; // Clear input on successful date update
        }
    } catch (error) {
        showToast(`Lỗi khi cập nhật '${field}'.`, 'error');
        console.error('User update error:', error);
        if (field !== 'expiresAt') {
             inputEl.value = userToUpdate[field];
        }
    }
}

function initializeAdminTab() {
    if (!DOM.adminTab || !appState.currentUserId) return;
    
    if (unsubscribeUsers) unsubscribeUsers();
    unsubscribeUsers = onSnapshot(collection(db, 'users'), snapshot => {
        localUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        localUsers.sort((a,b) => (a.email || '').localeCompare(b.email || ''));
        filterAndRenderUsers();
    }, console.error);

    DOM.adminUserFilterInput.addEventListener('input', debounce(filterAndRenderUsers, 300));
    DOM.adminUserListTbody.addEventListener('change', handleAdminUserUpdate);
}

function stopAdminListeners() {
    if (unsubscribeUsers) {
        unsubscribeUsers();
        unsubscribeUsers = null;
    }
}

// --- Content Management (Admin & Public) ---
let localUpdateLog = []; // holds the array of version objects
let unsubscribeUpdateLog = null;

// Renders the public update log view
function renderPublicUpdateLog(versions = []) {
    if (!DOM.updateLogContent) return;

    DOM.updateLogContent.innerHTML = '';
    if (versions.length === 0) {
        DOM.updateLogContent.appendChild(h('p', { className: 'form-text' }, 'Chưa có thông tin cập nhật nào.'));
        return;
    }

    // Sort by date descending (newest first)
    const sortedVersions = [...versions].sort((a, b) => {
        // Assuming date is in 'YYYY-MM-DD' format from <input type="date">
        return new Date(b.date) - new Date(a.date);
    });

    sortedVersions.forEach(version => {
        const embedUrl = getGDocsEmbedUrl(version.gdocsLink);
        const displayDate = formatInputDateToDisplay(version.date);

        const updateEntry = h('div', { className: 'update-entry' },
            h('h3', {}, `Phiên bản ${version.version} (${displayDate})`),
            embedUrl 
                ? h('iframe', { 
                    src: embedUrl, 
                    className: 'gdoc-iframe', 
                    style: 'width: 100%; height: 500px; border: 1px solid var(--border-color); border-radius: 0.5rem;',
                    frameborder: '0' 
                  })
                : h('div', {}, 
                    h('p', {className: 'form-text'}, 'Link tài liệu không hợp lệ hoặc bị thiếu. Vui lòng thử mở trực tiếp:'),
                    h('a', { href: version.gdocsLink, target: '_blank', rel: 'noopener noreferrer' }, version.gdocsLink)
                  )
        );
        DOM.updateLogContent.appendChild(updateEntry);
    });
}

// Renders the admin interface for managing the update log
function renderAdminUpdateLog() {
    if (!DOM.adminUpdateLogList) return;
    DOM.adminUpdateLogList.innerHTML = '';

    const sortedVersions = [...localUpdateLog].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sortedVersions.length === 0) {
        DOM.adminUpdateLogList.appendChild(h('p', { className: 'form-text' }, `Chưa có phiên bản nào.`));
        return;
    }

    sortedVersions.forEach(version => {
        const displayDate = formatInputDateToDisplay(version.date);
        const itemEl = h('div', { className: 'config-list-item' },
            h('div', { style: 'flex-grow: 1; min-width: 0;'}, 
                h('span', { style: 'font-weight: 600; color: var(--text-dark);'}, `v${version.version}`),
                h('span', { style: 'margin-left: 1rem; color: var(--text-light);'}, displayDate),
                h('p', { style: 'font-size: 0.8rem; color: var(--primary-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; margin: 0.25rem 0 0 0;'}, version.gdocsLink)
            ),
            h('div', { className: 'config-list-item-actions' },
                h('button', { className: 'edit-version-btn', dataset: { versionId: version.id }, title: 'Sửa' }, h('i', { className: 'fas fa-edit' })),
                h('button', { className: 'delete-version-btn', dataset: { versionId: version.id }, title: 'Xóa' }, h('i', { className: 'fas fa-trash' }))
            )
        );
        DOM.adminUpdateLogList.appendChild(itemEl);
    });
}

function resetUpdateLogForm() {
    DOM.adminUpdateLogForm.reset();
    DOM.adminUpdateIdInput.value = '';
    DOM.adminUpdateLogForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Phiên bản';
    DOM.cancelUpdateLogEditBtn.classList.add('hidden');
}

async function saveUpdateLog() {
    try {
        const docRef = doc(db, 'siteContent', 'updateLog');
        await setDoc(docRef, { versions: localUpdateLog });
        showToast('Đã lưu lịch sử cập nhật.', 'success');
    } catch (error) {
        showToast('Lỗi khi lưu lịch sử cập nhật.', 'error');
        console.error("Error saving update log:", error);
    }
}

function initializeAdminUpdateLogManagement() {
    if (!DOM.adminUpdateLogForm) return;

    // Add/Update version
    DOM.adminUpdateLogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = DOM.adminUpdateIdInput.value;
        const versionData = {
            version: DOM.adminUpdateVersionInput.value.trim(),
            date: DOM.adminUpdateDateInput.value, // YYYY-MM-DD format
            gdocsLink: DOM.adminUpdateLinkInput.value.trim(),
        };

        if (id) { // Editing existing
            const index = localUpdateLog.findIndex(v => v.id === id);
            if (index > -1) {
                localUpdateLog[index] = { ...localUpdateLog[index], ...versionData };
            }
        } else { // Adding new
            localUpdateLog.push({
                id: `v_${Date.now()}`,
                ...versionData
            });
        }
        await saveUpdateLog();
        resetUpdateLogForm();
    });

    // Handle Edit and Delete buttons
    DOM.adminUpdateLogList.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-version-btn');
        const deleteBtn = e.target.closest('.delete-version-btn');

        if (editBtn) {
            const versionId = editBtn.dataset.versionId;
            const version = localUpdateLog.find(v => v.id === versionId);
            if (version) {
                DOM.adminUpdateIdInput.value = version.id;
                DOM.adminUpdateVersionInput.value = version.version;
                DOM.adminUpdateDateInput.value = version.date; // Should be YYYY-MM-DD
                DOM.adminUpdateLinkInput.value = version.gdocsLink;

                DOM.adminUpdateLogForm.querySelector('button[type="submit"]').textContent = 'Cập nhật';
                DOM.cancelUpdateLogEditBtn.classList.remove('hidden');
                DOM.adminUpdateVersionInput.focus();
            }
        } else if (deleteBtn) {
            const versionId = deleteBtn.dataset.versionId;
            const version = localUpdateLog.find(v => v.id === versionId);
            if(version) {
                const confirmed = await showConfirm(`Bạn có chắc muốn xóa phiên bản ${version.version}?`);
                if (confirmed) {
                    localUpdateLog = localUpdateLog.filter(v => v.id !== versionId);
                    await saveUpdateLog();
                }
            }
        }
    });

    // Cancel edit
    DOM.cancelUpdateLogEditBtn.addEventListener('click', resetUpdateLogForm);
}

function listenForUpdateLog() {
    if (unsubscribeUpdateLog) unsubscribeUpdateLog();

    const docRef = doc(db, 'siteContent', 'updateLog');
    unsubscribeUpdateLog = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            localUpdateLog = docSnap.data().versions || [];
        } else {
            localUpdateLog = [];
        }
        renderPublicUpdateLog(localUpdateLog);
        
        if (appState.currentUserProfile?.role === 'admin') {
            renderAdminUpdateLog();
        }
    }, (error) => {
        console.error("Error listening to update log:", error);
        localUpdateLog = []; // reset on error
        renderPublicUpdateLog([]);
        if (appState.currentUserProfile?.role === 'admin') renderAdminUpdateLog();
    });
}

async function initializeAdminSettings() {
    if (!DOM.adminSettingsForm) return;

    const contentDocRef = doc(db, 'siteContent', 'main');
    
    try {
        const docSnap = await getDoc(contentDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            DOM.adminDefaultTrialDaysInput.value = data.defaultTrialDays || '';
        }
    } catch (error) {
        // Firebase permission error is expected if rules are not set for 'siteContent'. Fallback to default.
        DOM.adminDefaultTrialDaysInput.value = '';
    }

    DOM.adminSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newTrialDaysRaw = DOM.adminDefaultTrialDaysInput.value.trim();
        const newTrialDays = parseInt(newTrialDaysRaw, 10);

        if (newTrialDaysRaw && (isNaN(newTrialDays) || newTrialDays < 0)) {
            showToast('Số ngày dùng thử phải là một con số không âm.', 'error');
            return;
        }
        
        try {
            const settingsData = {
                defaultTrialDays: newTrialDaysRaw ? newTrialDays : null
            };
            await setDoc(contentDocRef, settingsData, { merge: true });
            showToast('Đã cập nhật cài đặt thành công!', 'success');
        } catch (error) {
            showToast('Lỗi khi lưu cài đặt.', 'error');
            console.error("Error saving admin settings:", error);
        }
    });

    initializeAdminUpdateLogManagement();
}


// --- Auth & App Initialization ---
onAuthStateChanged(auth, async (user) => {
    const loggedIn = !!user;

    // Stop all data listeners on auth state change to prevent data leaks
    if (appState.unsubscribeMaterials) appState.unsubscribeMaterials();
    if (appState.unsubscribeSavedItems) appState.unsubscribeSavedItems();
    stopConfigurationListeners();
    stopAdminListeners();

    if (loggedIn) {
        appState.currentUserId = user.uid;
        appState.currentUserProfile = await getUserProfile(user);
        
        appState.materialsCollectionRef = collection(db, `users/${appState.currentUserId}/materials`);
        appState.savedItemsCollectionRef = collection(db, `users/${appState.currentUserId}/savedItems`);
        
        updateCalculatorData({ userId: appState.currentUserId });
        
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

        if (appState.currentUserProfile?.role === 'admin') {
            initializeAdminTab();
            initializeAdminSettings();
        }
        
        listenForData();
    } else {
        appState.currentUserId = null;
        appState.currentUserProfile = null;
        clearLocalData();
        updateCalculatorData({ userId: null });
    }

    updateUIVisibility(loggedIn, user, appState.currentUserProfile);
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
    if (DOM.mainMaterialWoodCombobox?.updateComboboxData) DOM.mainMaterialWoodCombobox.updateComboboxData(appState.localMaterials['Ván']);
    if (DOM.mainMaterialBackPanelCombobox?.updateComboboxData) DOM.mainMaterialBackPanelCombobox.updateComboboxData(appState.localMaterials['Ván']);
    if (DOM.edgeMaterialCombobox?.updateComboboxData) DOM.edgeMaterialCombobox.updateComboboxData(appState.localMaterials['Cạnh']);
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
    listenForUpdateLog(); // Start listening for update log for everyone

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