const { ipcRenderer } = require('electron');
const { shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let selectedAppIcon = null;

const buttonGrid = document.querySelector('.button-grid');
const imageUpload = document.getElementById('image-upload');
const brightnessSlider = document.getElementById('brightness');
const brightnessValue = document.getElementById('brightness-value');



const buttonOrder = [
    1,  6, 11,   
    2,  7, 12,   
    3,  8, 13,   
    4,  9, 14,   
    5, 10, 15    
];


const buttonCells = new Map();

buttonOrder.forEach((buttonNumber) => {
    const buttonCell = document.createElement('div');
    buttonCell.className = 'button-cell';
    buttonCell.setAttribute('data-button', buttonNumber);
    buttonCell.setAttribute('data-button-number', buttonNumber);

    buttonCell.addEventListener('click', (e) => {
        if (e.target.closest('.button-controls')) return;
        showModal(buttonNumber);
    });

    const controls = document.createElement('div');
    controls.className = 'button-controls';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'control-btn';
    colorPicker.title = 'Set Color';

    const imageBtn = document.createElement('button');
    imageBtn.className = 'control-btn';
    imageBtn.textContent = 'Image';
    imageBtn.title = 'Set Image';

    controls.appendChild(colorPicker);
    controls.appendChild(imageBtn);
    buttonCell.appendChild(controls);
    buttonGrid.appendChild(buttonCell);

    
    buttonCells.set(buttonNumber, {
        element: buttonCell,
        colorPicker: colorPicker
    });

    
    colorPicker.addEventListener('change', async (e) => {
        const color = e.target.value;
        let r = parseInt(color.substr(1,2), 16);
        let g = parseInt(color.substr(3,2), 16);
        let b = parseInt(color.substr(5,2), 16);
        
        
        if (r === 0 && g === 0 && b === 0) {
            r = 1;
        }
        
        try {
            await ipcRenderer.invoke('setButtonColor', {
                buttonIndex: buttonNumber,
                color: { r, g, b }
            });
            
            buttonCell.style.backgroundColor = color;
            if (buttonCell.querySelector('img')) {
                buttonCell.querySelector('img').remove();
            }
        } catch (error) {
            console.error('Failed to set button color:', error);
        }
    });

    
    imageBtn.addEventListener('click', () => {
        imageUpload.setAttribute('data-target-button', buttonNumber);
        imageUpload.click();
    });
});


imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const buttonIndex = parseInt(imageUpload.getAttribute('data-target-button'));
    const buttonCell = document.querySelector(`[data-button="${buttonIndex}"]`);

    try {
        await ipcRenderer.invoke('setButtonImage', {
            buttonIndex,
            imagePath: file.path
        });

        
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        if (buttonCell.querySelector('img')) {
            buttonCell.querySelector('img').remove();
        }
        buttonCell.insertBefore(img, buttonCell.firstChild);
        buttonCell.style.backgroundColor = '#2a2a2a';
    } catch (error) {
        console.error('Failed to set button image:', error);
    }

    
    e.target.value = '';
});


brightnessSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    brightnessValue.textContent = `${value}%`;
    ipcRenderer.invoke('setBrightness', parseInt(value));
});


ipcRenderer.on('buttonPress', async (event, buttonIndex) => {
    
    const buttonCell = document.querySelector(`[data-button="${buttonIndex}"]`);
    if (buttonCell) {
        buttonCell.style.transform = 'scale(0.95)';
        setTimeout(() => {
            buttonCell.style.transform = 'scale(1)';
        }, 100);

        
        if (buttonConfigs[buttonIndex]) {
            await executeButtonAction(buttonIndex);
        } else {
            
            try {
                const color = {
                    r: Math.floor(Math.random() * 255),
                    g: Math.floor(Math.random() * 255),
                    b: Math.floor(Math.random() * 255)
                };
                
                await ipcRenderer.invoke('setButtonColor', {
                    buttonIndex,
                    color
                });
                
                buttonCell.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
                if (buttonCell.querySelector('img')) {
                    buttonCell.querySelector('img').remove();
                }
            } catch (error) {
                console.error('Failed to set random color:', error);
            }
        }
    }
});


ipcRenderer.on('loadConfig', (event, config) => {
    console.log('Renderer received configuration:', config);

    
    console.log('Setting brightness to:', config.brightness);
    brightnessSlider.value = config.brightness;
    brightnessValue.textContent = `${config.brightness}%`;

    
    config.buttons.forEach(button => {
        console.log(`Applying configuration for button ${button.id}:`, button);
        const buttonData = buttonCells.get(button.id);
        if (buttonData) {
            if (button.type === 'color') {
                console.log(`Setting button ${button.id} color to ${button.color}`);
                buttonData.element.style.backgroundColor = button.color;
                buttonData.colorPicker.value = button.color;
                if (buttonData.element.querySelector('img')) {
                    buttonData.element.querySelector('img').remove();
                }
            } else if (button.type === 'image' && button.base64) {
                console.log(`Setting button ${button.id} image from Base64...`);
                try {
                    const img = document.createElement('img');
                    img.src = button.base64; 
                    img.style.transform = 'rotate(90deg)';
                    img.onerror = () => {
                        console.error(`Failed to load image for button ${button.id} from Base64 data.`);
                        buttonData.element.style.backgroundColor = '#2a2a2a';
                    };
                    if (buttonData.element.querySelector('img')) {
                        buttonData.element.querySelector('img').remove();
                    }
                    buttonData.element.insertBefore(img, buttonData.element.firstChild);
                    buttonData.element.style.backgroundColor = '#2a2a2a';
                } catch (error) {
                    console.error(`Error setting image for button ${button.id}:`, error);
                }
            }
        } else {
            console.error(`Button cell not found for button ${button.id}`);
        }
    });
});


let buttonConfigs = {};
let currentButtonNumber = null;


const modal = document.getElementById('button-config-modal');
const closeModalBtn = modal.querySelector('.close-modal');
const currentButtonSpan = document.getElementById('current-button-number');
const actionButtons = modal.querySelectorAll('.action-button');
const fileInputContainer = modal.querySelector('.file-input-container');
const urlInputContainer = modal.querySelector('.url-input-container');
const appPathInput = document.getElementById('app-path');
const urlInput = document.getElementById('url-input');
const confirmButtons = modal.querySelectorAll('.confirm-btn');


window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

closeModalBtn.addEventListener('click', closeModal);

function closeModal() {
    modal.style.display = 'none';
    fileInputContainer.classList.remove('visible');
    urlInputContainer.classList.remove('visible');
    currentButtonNumber = null;
}

function showModal(buttonNumber) {
    currentButtonNumber = buttonNumber;
    currentButtonSpan.textContent = buttonNumber;
    modal.style.display = 'block';
}


const appFileInput = document.createElement('input');
appFileInput.type = 'file';
appFileInput.id = 'app-file-select';
appFileInput.accept = '.exe,.app';
appFileInput.style.display = 'none';
document.body.appendChild(appFileInput);


actionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const action = button.dataset.action;
        fileInputContainer.classList.remove('visible');
        urlInputContainer.classList.remove('visible');

        switch (action) {
            case 'app':
                
                appFileInput.click();
                break;
            case 'url':
                urlInputContainer.classList.add('visible');
                break;
            case 'macro':
                startMacroRecording();
                break;
            case 'folder':
                convertToFolder();
                break;
        }
    });
});


appFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        appPathInput.value = file.path;
        fileInputContainer.classList.add('visible');
        
        
        const useIconCheckbox = document.getElementById('use-app-icon');
        const originalLabel = useIconCheckbox.nextElementSibling.textContent;
        useIconCheckbox.nextElementSibling.textContent = 'Extracting icon...';
        useIconCheckbox.disabled = true;
        
        
        selectedAppIcon = await extractAppIcon(file.path);
        
        
        useIconCheckbox.nextElementSibling.textContent = originalLabel;
        useIconCheckbox.disabled = false;
        
        
        if (!selectedAppIcon) {
            useIconCheckbox.checked = false;
            useIconCheckbox.nextElementSibling.textContent += ' (Icon extraction failed)';
        }
    }
    
    e.target.value = '';
});


confirmButtons.forEach(button => {
    button.addEventListener('click', async () => {
        const container = button.parentElement;
        if (container.classList.contains('file-input-container')) {
            const appPath = appPathInput.value;
            const useAppIcon = document.getElementById('use-app-icon').checked;
            
            if (appPath) {
                
                setButtonConfig('app', { 
                    path: appPath,
                    useAppIcon: useAppIcon,
                    iconData: useAppIcon ? selectedAppIcon : null
                });

                
                if (useAppIcon && selectedAppIcon) {
                    try {
                        await ipcRenderer.invoke('setButtonImage', {
                            buttonIndex: currentButtonNumber,
                            imageData: selectedAppIcon,
                            isIcon: true
                        });
                    } catch (error) {
                        console.error('Failed to set button icon:', error);
                    }
                } else {
                    
                    const defaultAppColor = { r: 64, g: 64, b: 255 };  
                    try {
                        await ipcRenderer.invoke('setButtonColor', {
                            buttonIndex: currentButtonNumber,
                            color: defaultAppColor
                        });
                    } catch (error) {
                        console.error('Failed to set default app color:', error);
                    }
                }
            }
        } else if (container.classList.contains('url-input-container')) {
            const url = urlInput.value;
            if (url) {
                setButtonConfig('url', { url: url });
                
                const defaultUrlColor = { r: 76, g: 175, b: 80 };  
                try {
                    await ipcRenderer.invoke('setButtonColor', {
                        buttonIndex: currentButtonNumber,
                        color: defaultUrlColor
                    });
                } catch (error) {
                    console.error('Failed to set default URL color:', error);
                }
            }
        }
        closeModal();
    });
});

function setButtonConfig(type, config) {
    if (!currentButtonNumber) return;
    
    console.log('Setting button config:', { buttonNumber: currentButtonNumber, type, config });
    
    buttonConfigs[currentButtonNumber] = {
        type,
        config,
        timestamp: Date.now()
    };
    
    
    localStorage.setItem('buttonConfigs', JSON.stringify(buttonConfigs));
    console.log('Updated buttonConfigs:', buttonConfigs);
    
    
    updateButtonAppearance(currentButtonNumber);
}

function updateButtonAppearance(buttonNumber) {
    const config = buttonConfigs[buttonNumber];
    const button = document.querySelector(`[data-button="${buttonNumber}"]`);
    if (!button || !config) return;

    
    const controls = button.querySelector('.button-controls');
    button.innerHTML = '';
    if (controls) {
        button.appendChild(controls);
    }

    
    const content = document.createElement('div');
    content.className = 'button-content';
    
    switch (config.type) {
        case 'app':
            const appName = config.config.path.split('\\').pop().split('/').pop();
            if (config.config.useAppIcon && config.config.iconData) {
                
                const iconImg = document.createElement('img');
                iconImg.src = config.config.iconData;
                iconImg.className = 'app-icon';
                iconImg.onerror = () => {
                    
                    content.innerHTML = `<i>📱</i><span>${appName}</span>`;
                };
                content.appendChild(iconImg);
                content.appendChild(document.createElement('span')).textContent = appName;
            } else {
                content.innerHTML = `<i>📱</i><span>${appName}</span>`;
            }
            break;
        case 'url':
            try {
                const hostname = new URL(config.config.url).hostname;
                content.innerHTML = `<i>🌐</i><span>${hostname}</span>`;
            } catch (error) {
                content.innerHTML = `<i>🌐</i><span>${config.config.url}</span>`;
            }
            break;
        case 'macro':
            content.innerHTML = `<i>⌨️</i><span>Macro</span>`;
            break;
        case 'folder':
            content.innerHTML = `<i>📁</i><span>Folder</span>`;
            break;
    }
    
    button.insertBefore(content, controls);
}

function startMacroRecording() {
    
    alert('Macro recording will be implemented soon!');
    closeModal();
}

function convertToFolder() {
    if (!currentButtonNumber) return;
    
    setButtonConfig('folder', {
        items: []
    });
    
    closeModal();
}


const savedConfigs = localStorage.getItem('buttonConfigs');
if (savedConfigs) {
    buttonConfigs = JSON.parse(savedConfigs);
    
    Object.keys(buttonConfigs).forEach(buttonNumber => {
        updateButtonAppearance(parseInt(buttonNumber));
    });
}


async function executeButtonAction(buttonNumber) {
    const config = buttonConfigs[buttonNumber];
    if (!config) return;

    console.log('Executing button action:', { buttonNumber, config });

    switch (config.type) {
        case 'app':
            try {
                console.log('Launching application:', config.config.path);
                exec(`"${config.config.path}"`, (error) => {
                    if (error) {
                        console.error('Error launching application:', error);
                        alert('Failed to launch application');
                    } else {
                        console.log('Application launched successfully');
                    }
                });
            } catch (error) {
                console.error('Error launching application:', error);
                alert('Failed to launch application');
            }
            break;

        case 'url':
            try {
                console.log('Opening URL:', config.config.url);
                await shell.openExternal(config.config.url);
                console.log('URL opened successfully');
            } catch (error) {
                console.error('Error opening URL:', error);
                alert('Failed to open URL');
            }
            break;

        case 'macro':
            console.log('Macro playback not implemented yet');
            alert('Macro playback will be implemented soon!');
            break;

        case 'folder':
            console.log('Folder navigation not implemented yet');
            alert('Folder navigation will be implemented soon!');
            break;
    }
}


async function extractAppIcon(appPath) {
    try {
        console.log('Attempting to extract icon from:', appPath);
        const iconData = await ipcRenderer.invoke('extractAppIcon', appPath);
        console.log('Icon extracted successfully');
        return iconData;
    } catch (error) {
        console.warn('Failed to extract app icon:', error);
        return null;
    }
}


const style = document.createElement('style');
style.textContent = `
    .app-icon {
        width: 24px;
        height: 24px;
        object-fit: contain;
        margin-bottom: 4px;
    }
    
    .checkbox-container {
        margin: 10px 0;
        color: #ccc;
    }

    .checkbox-container input[type="checkbox"] {
        margin-right: 8px;
    }

    .checkbox-container input[type="checkbox"]:disabled + label {
        color: #666;
    }

    .button-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 4px;
    }

    .button-content span {
        font-size: 12px;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;
document.head.appendChild(style);
