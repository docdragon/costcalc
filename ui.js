// ui.js
import { 
    auth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    setPersistence,
    browserSessionPersistence,
    browserLocalPersistence
} from './firebase.js';
import * as DOM from './dom.js';

// --- State for UI ---
let onImageUploadedCallback = null;
let onImageRemovedCallback = null;

// --- Modal Handling ---
export function openModal(modal) { modal.classList.remove('hidden'); }
export function closeModal(modal) { modal.classList.add('hidden'); }
export function closeAllModals() {
    [DOM.loginModal, DOM.viewItemModal, DOM.confirmModal].forEach(modal => modal && closeModal(modal));
}

// --- Custom Confirm Modal ---
export function showConfirm(message) {
    return new Promise((resolve) => {
        DOM.confirmMessage.textContent = message;
        openModal(DOM.confirmModal);

        const onOk = () => {
            resolve(true);
            cleanup();
        };

        const onCancel = () => {
            resolve(false);
            cleanup();
        };
        
        const cleanup = () => {
            closeModal(DOM.confirmModal);
            DOM.confirmOkBtn.removeEventListener('click', onOk);
            DOM.confirmCancelBtn.removeEventListener('click', onCancel);
        };

        DOM.confirmOkBtn.addEventListener('click', onOk, { once: true });
        DOM.confirmCancelBtn.addEventListener('click', onCancel, { once: true });
    });
}

// --- Toast Notification ---
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    const icons = { info: 'info-circle', success: 'check-circle', error: 'exclamation-triangle' };
    toast.innerHTML = `<i class="fas fa-${icons[type]} toast-icon"></i> ${message}`;
    
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
}

// --- UI Visibility ---
export function updateUIVisibility(isLoggedIn, user) {
    DOM.loggedInView.classList.toggle('hidden', !isLoggedIn);
    DOM.loggedOutView.classList.toggle('hidden', isLoggedIn);
    DOM.userEmailDisplay.textContent = isLoggedIn ? (user.displayName || user.email) : '';
    
    document.querySelectorAll('.calculator-form-content, .materials-form-content, .saved-items-content, .quick-calc-form-content, .component-names-content, .config-form-content').forEach(el => {
        el.style.display = isLoggedIn ? 'block' : 'none';
    });
    document.querySelectorAll('.login-prompt-view').forEach(el => {
        el.style.display = isLoggedIn ? 'none' : 'block';
    });

    if (isLoggedIn) closeAllModals();
}

// --- Image Upload Logic ---
function handleImageFile(file) {
    if (!file.type.startsWith('image/')) { showToast('Vui lòng chọn một file ảnh.', 'error'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
        const imageData = { mimeType: file.type, data: reader.result.split(',')[1] };
        if(onImageUploadedCallback) {
            onImageUploadedCallback(imageData);
        }
        DOM.imagePreview.src = reader.result;
        DOM.imageUploadPrompt.classList.add('hidden');
        DOM.imagePreviewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

export function initializeImageUploader(uploadedCallback, removedCallback) {
    onImageUploadedCallback = uploadedCallback;
    onImageRemovedCallback = removedCallback;
    DOM.imageUploader.addEventListener('click', () => DOM.imageInput.click());
    DOM.imageUploader.addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary-color)'; });
    DOM.imageUploader.addEventListener('dragleave', (e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; });
    DOM.imageUploader.addEventListener('drop', (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length > 0) handleImageFile(e.dataTransfer.files[0]);
    });
    DOM.imageInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleImageFile(e.target.files[0]); });
    DOM.removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if(onImageRemovedCallback) {
            onImageRemovedCallback();
        }
        DOM.imageInput.value = '';
        DOM.imagePreview.src = '#';
        DOM.imagePreviewContainer.classList.add('hidden');
        DOM.imageUploadPrompt.classList.remove('hidden');
    });
}

// --- Tab Navigation ---
export function initializeTabs() {
    DOM.tabs.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button) {
            const tabName = button.dataset.tab;
            const currentActive = DOM.tabs.querySelector('.active');
            if(currentActive) currentActive.classList.remove('active');
            button.classList.add('active');
            
            for (let pane of DOM.tabContent.children) {
                pane.classList.toggle('hidden', pane.id !== `${tabName}-tab`);
            }
        }
    });
}

/**
 * Initializes a searchable combobox component.
 * @param {HTMLElement} container The container element for the combobox.
 * @param {Array<object>} optionsData Array of objects, e.g., [{id, name, price, unit}]
 * @param {function} onSelect Callback function when an option is selected.
 * @param {object} config Configuration options.
 */
export function initializeCombobox(container, optionsData, onSelect, config = {}) {
    if (container.dataset.comboboxInitialized) {
        if (container.updateComboboxData) {
            container.updateComboboxData(optionsData);
        }
        return;
    }

    const input = container.querySelector('.combobox-input');
    const valueInput = container.querySelector('.combobox-value');
    const optionsWrapper = container.querySelector('.combobox-options-wrapper');
    const optionsList = container.querySelector('.combobox-options');

    let currentOptionsData = optionsData || [];
    const { placeholder = "Chọn...", allowEmpty = false, emptyOptionText = "--- Không chọn ---", allowCustom = false } = config;
    if (placeholder) {
        input.placeholder = placeholder;
    }

    const renderOptions = (filterText = '') => {
        optionsList.innerHTML = '';
        let filteredOptions = currentOptionsData.filter(o => o.name.toLowerCase().includes(filterText.toLowerCase()));

        if (allowEmpty) {
            const emptyOption = document.createElement('li');
            emptyOption.className = 'combobox-option';
            emptyOption.dataset.id = '';
            emptyOption.textContent = emptyOptionText;
            optionsList.appendChild(emptyOption);
        }

        if (filteredOptions.length === 0 && !allowEmpty) {
            optionsList.innerHTML = `<li class="combobox-option no-results">Không tìm thấy kết quả</li>`;
        } else {
            filteredOptions.forEach(option => {
                const li = document.createElement('li');
                li.className = 'combobox-option';
                li.dataset.id = option.id;
                
                let displayText = option.name;
                if(option.price && option.unit) {
                    const priceText = Number(option.price).toLocaleString('vi-VN');
                    displayText += ` (${priceText}đ / ${option.unit})`;
                }
                li.textContent = displayText;
                optionsList.appendChild(li);
            });
        }
    };

    const closeDropdown = () => {
        if (optionsWrapper.classList.contains('show')) {
            optionsWrapper.classList.remove('show');
            document.removeEventListener('click', handleClickOutside, true);
        }
    };
    
    const handleClickOutside = (e) => {
        if (!container.contains(e.target)) {
            closeDropdown();
        }
    };

    container.updateComboboxData = (newOptions) => {
        currentOptionsData = newOptions || [];
        if (optionsWrapper.classList.contains('show') || input.value) {
            renderOptions(input.value);
        }
    };

    container.setValue = (id) => {
        valueInput.value = id;
        if (id) {
            const item = currentOptionsData.find(o => o.id === id);
            input.value = item ? item.name : '';
        } else {
            input.value = '';
        }
    };
    
    input.addEventListener('focus', () => {
        renderOptions(input.value);
        optionsWrapper.classList.add('show');
        document.addEventListener('click', handleClickOutside, true);
    });

    input.addEventListener('input', () => {
        if (!allowCustom) {
            valueInput.value = ''; 
            if (onSelect) onSelect('');
        }
        renderOptions(input.value);
        if (!optionsWrapper.classList.contains('show')) {
            optionsWrapper.classList.add('show');
        }
    });

    // Handle losing focus - for custom values
    input.addEventListener('blur', () => {
        // A small delay to allow a click on an option to register before closing
        setTimeout(() => {
            closeDropdown();
            // If custom values allowed, the input's text itself is the value
            // and we need to trigger the change event on it for other listeners.
            if (allowCustom) {
                 input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, 150);
    });

    optionsList.addEventListener('click', (e) => {
        const optionEl = e.target.closest('.combobox-option');
        if (optionEl && !optionEl.classList.contains('no-results')) {
            const selectedId = optionEl.dataset.id;
            const selectedItem = currentOptionsData.find(o => o.id === selectedId);
            
            valueInput.value = selectedId;
            input.value = selectedItem ? selectedItem.name : (allowEmpty && !selectedId ? '' : optionEl.textContent);
            
            closeDropdown();
            
            if (onSelect) {
                onSelect(selectedId);
            }
            // Trigger change event to ensure other listeners pick up the update
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    container.dataset.comboboxInitialized = 'true';
    renderOptions();
}

/**
 * Safely evaluates a mathematical expression string.
 */
function evaluateMathExpression(expr) {
    if (/[^0-9\s.()+\-*/]/.test(expr)) {
        return null;
    }
    try {
        const result = new Function(`return ${expr}`)();
        if (typeof result === 'number' && isFinite(result)) {
            return result;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Initializes number inputs to evaluate math expressions on Enter.
 */
export function initializeMathInput(selector) {
    document.body.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches(selector)) {
            const input = e.target;
            e.preventDefault(); 
            const expression = input.value;
            const result = evaluateMathExpression(expression);

            if (result !== null) {
                input.value = Number(result.toFixed(4)); 
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    });
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed since the last time the debounced function was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// --- Modal & Auth Button Listeners ---
async function handleGoogleLogin() {
    const persistenceType = DOM.rememberMeCheckbox.checked
        ? browserLocalPersistence
        : browserSessionPersistence;
    
    // Set persistence before calling the sign-in method
    await setPersistence(auth, persistenceType);
    await signInWithPopup(auth, new GoogleAuthProvider());
}

export function initializeModals() {
    DOM.openLoginModalBtn.addEventListener('click', () => openModal(DOM.loginModal));
    document.querySelectorAll('.modal-close-btn, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => { if (e.target === el) closeAllModals(); });
    });
    
    DOM.googleLoginBtn.addEventListener('click', async () => {
        DOM.loginError.textContent = '';
        try {
            await handleGoogleLogin();
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            DOM.loginError.textContent = "Không thể đăng nhập với Google. Vui lòng thử lại.";
        }
    });
}