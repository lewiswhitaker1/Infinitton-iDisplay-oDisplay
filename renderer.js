const { ipcRenderer } = require('electron');


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


ipcRenderer.on('buttonPress', (event, buttonIndex) => {
    const buttonCell = document.querySelector(`[data-button="${buttonIndex}"]`);
    if (buttonCell) {
        buttonCell.style.transform = 'scale(0.95)';
        setTimeout(() => {
            buttonCell.style.transform = 'scale(1)';
        }, 100);
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
