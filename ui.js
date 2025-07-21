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
import { h, parseNumber } from './utils.js';

// --- State for UI ---
let elementThatOpenedModal = null; // For focus restoration

// --- Modal Handling ---
export function openModal(modal) {
    elementThatOpenedModal = document.activeElement; // Save focus
    modal.classList.remove('hidden');
    
    // Focus Trap Logic
    const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    
    // Set initial focus
    setTimeout(() => firstFocusableElement?.focus(), 100);

    const handleKeyDown = (e) => {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey) { // Shift + Tab
            if (document.activeElement === firstFocusableElement) {
                lastFocusableElement.focus();
                e.preventDefault();
            }
        } else { // Tab
            if (document.activeElement === lastFocusableElement) {
                firstFocusableElement.focus();
                e.preventDefault();
            }
        }
    };

    modal.addEventListener('keydown', handleKeyDown);
    modal.dataset.keydownListener = 'true'; // Mark that a listener is attached
}

export function closeModal(modal) {
    if (modal.dataset.keydownListener) {
        // In a real app, you would remove the specific listener function.
        // For simplicity here, we'll just remove the flag. A more robust
        // implementation would store the listener function itself.
        delete modal.dataset.keydownListener;
    }
    modal.classList.add('hidden');
    elementThatOpenedModal?.focus(); // Restore focus
}

export function closeAllModals() {
    [DOM.loginModal, DOM.viewItemModal, DOM.confirmModal].forEach(modal => {
        if (modal && !modal.classList.contains('hidden')) closeModal(modal)
    });
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

// --- Tab Navigation ---
export function initializeTabs() {
    DOM.tabs.addEventListener('click', (e) => {
        const button = e.target.closest('button[role="tab"]');
        if (button) {
            // Deactivate all tabs in the list
            DOM.tabs.querySelectorAll('[role="tab"]').forEach(tab => {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
            });
            
            // Activate the clicked tab
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');
            
            // Hide all panes and show the one controlled by the clicked tab
            if (DOM.tabContent) {
                 for (let pane of DOM.tabContent.children) {
                    if (pane.getAttribute('role') === 'tabpanel') {
                         pane.classList.toggle('hidden', pane.id !== button.getAttribute('aria-controls'));
                    }
                }
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
    let highlightedIndex = -1;
    const { placeholder = "Chọn...", allowEmpty = false, emptyOptionText = "--- Không chọn ---", allowCustom = false } = config;
    if (placeholder) {
        input.placeholder = placeholder;
    }

    // Accessibility setup
    container.setAttribute('role', 'combobox');
    container.setAttribute('aria-haspopup', 'listbox');
    container.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');
    const optionsListId = `combobox-options-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    optionsList.id = optionsListId;
    optionsList.setAttribute('role', 'listbox');
    input.setAttribute('aria-controls', optionsListId);

    const selectOption = (optionEl) => {
        if (optionEl && !optionEl.classList.contains('no-results')) {
            const selectedId = optionEl.dataset.id;
            
            valueInput.value = selectedId;
            const selectedItem = currentOptionsData.find(o => o.id === selectedId);
            input.value = selectedItem ? selectedItem.name : (allowEmpty && !selectedId ? '' : optionEl.textContent);
            
            closeDropdown();
            
            if (onSelect) {
                onSelect(selectedId);
            }
            const changeEvent = new Event('change', { bubbles: true });
            valueInput.dispatchEvent(changeEvent);
            input.dispatchEvent(changeEvent);
        }
    };
    
    const renderOptions = (filterText = '') => {
        optionsList.innerHTML = '';
        let filteredOptions = currentOptionsData.filter(o => o.name.toLowerCase().includes(filterText.toLowerCase()));
    
        if (allowEmpty) {
            filteredOptions.unshift({ id: '', name: emptyOptionText });
        }
    
        if (filteredOptions.length === 0 && !allowCustom) {
            optionsList.innerHTML = `<li class="combobox-option no-results">Không tìm thấy kết quả</li>`;
        } else {
            filteredOptions.forEach((option, index) => {
                const li = document.createElement('li');
                li.className = 'combobox-option';
                li.dataset.id = option.id;
                li.setAttribute('role', 'option');
                li.id = `${optionsListId}-option-${index}`;
                
                let displayText = option.name;
                if(option.price && option.unit) {
                    const priceText = Number(option.price).toLocaleString('vi-VN');
                    displayText += ` (${priceText}đ / ${option.unit})`;
                }
                li.textContent = displayText;
                optionsList.appendChild(li);
            });
        }
        highlightedIndex = -1;
    };

    const closeDropdown = () => {
        if (optionsWrapper.classList.contains('show')) {
            optionsWrapper.classList.remove('show');
            container.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
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
        const changeEvent = new Event('change', { bubbles: true });
        valueInput.dispatchEvent(changeEvent);
        input.dispatchEvent(changeEvent);
    };
    
    input.addEventListener('focus', () => {
        renderOptions(input.value);
        optionsWrapper.classList.add('show');
        container.setAttribute('aria-expanded', 'true');
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
            container.setAttribute('aria-expanded', 'true');
        }
    });

    input.addEventListener('keydown', (e) => {
        const options = optionsList.querySelectorAll('.combobox-option:not(.no-results)');
        if (!options.length) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                highlightedIndex = Math.max(highlightedIndex - 1, 0);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex > -1 && options[highlightedIndex]) {
                    selectOption(options[highlightedIndex]);
                }
                return; // Prevent form submission
            case 'Escape':
                closeDropdown();
                return;
            default:
                return;
        }
        
        options.forEach(opt => opt.classList.remove('highlighted'));
        if (highlightedIndex > -1) {
            options[highlightedIndex].classList.add('highlighted');
            options[highlightedIndex].scrollIntoView({ block: 'nearest' });
            input.setAttribute('aria-activedescendant', options[highlightedIndex].id);
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
        selectOption(e.target.closest('.combobox-option'));
    });

    container.dataset.comboboxInitialized = 'true';
    renderOptions();
}

/**
 * Creates a paginator instance to manage pagination state and controls.
 */
export function createPaginator({ controlsEl, pageInfoEl, prevBtn, nextBtn, itemsPerPage, onPageChange }) {
    let currentPage = 1;
    let totalPages = 1;

    function updateControls() {
        if (!controlsEl) return;
        if (totalPages <= 1) {
            controlsEl.classList.add('hidden');
            return;
        }
        controlsEl.classList.remove('hidden');
        if (pageInfoEl) pageInfoEl.textContent = `Trang ${currentPage} / ${totalPages}`;
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    }

    prevBtn?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateControls();
            onPageChange(currentPage);
        }
    });

    nextBtn?.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateControls();
            onPageChange(currentPage);
        }
    });

    return {
        update: (totalItems) => {
            totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
            if (currentPage > totalPages) currentPage = totalPages;
            updateControls();
        },
        reset: () => {
            currentPage = 1;
        },
        getCurrentPage: () => currentPage,
    };
}


/**
 * Creates an accessory manager to handle adding, removing, and updating accessories.
 */
export function createAccessoryManager({ listEl, addBtn, quantityInput, materialCombobox, onUpdate, showToast, comboboxPlaceholder = "Tìm vật tư..." }) {
    let accessories = [];
    let allMaterials = [];

    function render() {
        listEl.innerHTML = '';
        accessories.forEach(acc => {
            const li = h('li', { dataset: { id: acc.id } },
                h('span', { className: 'flex-grow' },
                    `${acc.name} `,
                    h('span', { className: 'tag-type', style: 'font-size: 0.65rem; padding: 0.1rem 0.4rem; vertical-align: middle;' }, acc.type)
                ),
                h('input', { type: 'text', inputMode: 'decimal', value: String(acc.quantity).replace('.',','), min: '1', className: 'input-style accessory-list-qty', dataset: { id: acc.id } }),
                h('span', { className: 'accessory-unit' }, acc.unit),
                h('button', { className: 'remove-acc-btn', dataset: { id: acc.id }, 'aria-label': `Xóa ${acc.name}` }, '×')
            );
            listEl.appendChild(li);
        });
    }

    addBtn.addEventListener('click', () => {
        const selectedId = materialCombobox.querySelector('.combobox-value').value;
        const quantity = parseNumber(quantityInput.value);
        if (!selectedId || !quantity || quantity <= 0) {
            showToast('Vui lòng chọn vật tư và nhập số lượng hợp lệ.', 'error');
            return;
        }
        const material = allMaterials.find(a => a.id === selectedId);
        if (!material) {
            showToast('Lỗi: Không tìm thấy vật tư đã chọn.', 'error');
            return;
        }
        const existing = accessories.find(a => a.id === selectedId);
        if (existing) {
            existing.quantity += quantity;
        } else {
            accessories.push({ ...material, quantity });
        }
        render();
        quantityInput.value = '1';
        if (materialCombobox.setValue) materialCombobox.setValue('');
        onUpdate(accessories);
    });

    listEl.addEventListener('click', e => {
        if (e.target.classList.contains('remove-acc-btn')) {
            accessories = accessories.filter(a => a.id !== e.target.dataset.id);
            render();
            onUpdate(accessories);
        }
    });

    listEl.addEventListener('change', e => {
        if (e.target.classList.contains('accessory-list-qty')) {
            const id = e.target.dataset.id;
            const newQuantity = parseNumber(e.target.value);
            const accessory = accessories.find(a => a.id === id);
            if (accessory && newQuantity > 0) {
                accessory.quantity = newQuantity;
            } else if (accessory) {
                e.target.value = accessory.quantity; // Revert to old value
            }
            onUpdate(accessories);
        }
    });

    initializeCombobox(materialCombobox, [], null, { placeholder: comboboxPlaceholder });

    return {
        updateMaterials: (newMaterials) => {
            allMaterials = newMaterials;
            if (materialCombobox.updateComboboxData) {
                materialCombobox.updateComboboxData(allMaterials);
            }
        },
        setAccessories: (newAccessories) => {
            accessories = newAccessories;
            render();
            onUpdate(accessories);
        }
    };
}


/**
 * Safely evaluates a mathematical expression string, supporting Vietnamese number formats.
 */
function evaluateMathExpression(expr) {
    if (typeof expr !== 'string') return null;
    // Before evaluation, standardize the expression for the JS engine.
    // 1. Remove thousand separators (dots).
    // 2. Convert comma decimal separator to a dot.
    const standardExpr = expr.replace(/\./g, '').replace(/,/g, '.');
    if (/[^0-9\s.()+\-*/]/.test(standardExpr)) {
        return null;
    }
    try {
        // Use the Function constructor for safe evaluation of the sanitized string.
        const result = new Function(`return ${standardExpr}`)();
        if (typeof result === 'number' && isFinite(result)) {
            return result;
        }
        return null;
    } catch (e) {
        // Errors in evaluation (e.g., syntax error) will be caught.
        return null;
    }
}


/**
 * Initializes number inputs to evaluate math expressions on Enter,
 * handling and formatting with Vietnamese conventions.
 */
export function initializeMathInput(selector) {
    document.body.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.matches(selector)) {
            const input = e.target;
            e.preventDefault(); 
            const expression = input.value;
            const result = evaluateMathExpression(expression);

            if (result !== null) {
                // toFixed handles floating point issues & limits decimals.
                // parseFloat(...).toString() removes trailing zeros (e.g., 5.5000 -> "5.5").
                const resultString = parseFloat(result.toFixed(4)).toString();
                // Format the result back to using a comma for the decimal separator.
                input.value = resultString.replace('.', ',');
                
                // Dispatch the 'input' event to trigger calculations and other formatting.
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

/**
 * Initializes automatic number formatting for specified input fields using Vietnamese conventions.
 * This function adds thousand separators ('.') as the user types.
 * @param {string} selector - A CSS selector for the input fields.
 */
export function initializeNumberInputFormatting(selector) {
    const formatAndSet = (input) => {
        const originalValue = input.value;
        if (originalValue === '') return;
        
        // If the value looks like a formula, don't format it. Let the math evaluator handle it on Enter.
        if (/[+\-*/()]/.test(originalValue)) {
            return;
        }
        
        const selectionStart = input.selectionStart;
        const lengthBefore = originalValue.length;

        // 1. Standardize the number string for parsing
        // Remove thousand separators (dots), then replace the first decimal comma with a dot
        let rawValue = originalValue.replace(/\./g, '');
        const commaIndex = rawValue.indexOf(',');
        if (commaIndex !== -1) {
            const intPart = rawValue.substring(0, commaIndex);
            const decPart = rawValue.substring(commaIndex + 1).replace(/,/g, '');
            rawValue = `${intPart}.${decPart}`;
        }
        rawValue = rawValue.replace(/[^0-9.]/g, ''); // Remove any remaining non-numeric/non-dot chars

        const parts = rawValue.split('.');
        const integerPartStr = parts[0];
        const decimalPartStr = parts[1];

        // 2. Format the integer part
        let formattedValue;
        if (integerPartStr) {
            // Use Intl.NumberFormat for robust formatting
            formattedValue = new Intl.NumberFormat('vi-VN').format(integerPartStr);
        } else {
            formattedValue = '';
        }

        // 3. Append decimal part
        if (decimalPartStr !== undefined) {
            // Handle cases where user types "," first, or deletes all integer digits.
            if (formattedValue === '') {
                formattedValue = '0';
            }
            formattedValue += ',' + decimalPartStr;
        }

        // 4. Update the input field if the value has changed
        if (originalValue !== formattedValue) {
            input.value = formattedValue;
            
            // 5. Attempt to restore cursor position by tracking length change
            const lengthAfter = formattedValue.length;
            const newCursorPos = selectionStart + (lengthAfter - lengthBefore);
            try {
                input.setSelectionRange(newCursorPos, newCursorPos);
            } catch (e) {
                // Ignore errors that can happen if the cursor position is out of bounds
            }
        }
    };

    document.body.addEventListener('input', e => {
        if (e.target.matches(selector)) {
            formatAndSet(e.target);
        }
    });
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
        el.addEventListener('click', (e) => {
            if (e.target === el) {
                const modal = e.target.closest('.modal-overlay');
                if (modal) closeModal(modal);
            }
        });
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