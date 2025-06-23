const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Jimp = require('jimp');
const InfinittonDevice = require('./infinitton');
const ConfigManager = require('./configManager');

let mainWindow;
let device;
let configManager;

async function initializeDevice() {
    try {
        if (!device) {
            console.log('Creating new Infinitton device instance...');
            device = new InfinittonDevice();
            device.on('buttonPress', (button) => {
                if (mainWindow) {
                    mainWindow.webContents.send('buttonPress', button);
                }
            });
        }

        return device;
    } catch (error) {
        console.error('Failed to initialize device:', error);
        throw error;
    }
}

async function applyConfiguration(config) {
    try {
        console.log('Applying configuration to device...');
        
        
        console.log('Setting brightness to:', config.brightness);
        device.setBrightness(config.brightness);
        
        
        console.log('Applying button configurations...');
        for (const button of config.buttons) {
            try {
                if (button.type === 'color' && button.color !== '#2a2a2a') {
                    console.log(`Setting button ${button.id} color to ${button.color}`);
                    const color = button.color;
                    let r = parseInt(color.substr(1,2), 16);
                    let g = parseInt(color.substr(3,2), 16);
                    let b = parseInt(color.substr(5,2), 16);
                    
                    
                    if (r === 0 && g === 0 && b === 0) {
                        r = 1;
                    }
                    
                    await device.setButtonColor(button.id, { r, g, b });
                } else if (button.type === 'image' && button.base64) {
                    console.log(`Loading button ${button.id} image from Base64...`);
                    const buffer = Buffer.from(button.base64.replace(/^data:image\/png;base64,/, ''), 'base64');
                    const image = await Jimp.read(buffer);
                    const { data } = image.bitmap;
                    const bgrBuffer = Buffer.alloc(image.bitmap.width * image.bitmap.height * 3);
                    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
                        bgrBuffer[j] = data[i + 2];
                        bgrBuffer[j + 1] = data[i + 1];
                        bgrBuffer[j + 2] = data[i];
                    }
                    await device.setButtonImage(button.id, bgrBuffer);
                }
            } catch (error) {
                console.error(`Failed to configure button ${button.id}:`, error);
            }
        }
        console.log('Configuration applied to device successfully');
    } catch (error) {
        console.error('Error applying configuration to device:', error);
        throw error;
    }
}

async function createWindow() {
    try {
        
        console.log('Initializing config manager...');
        configManager = new ConfigManager();
        await configManager.initialize();

        console.log('Initializing device...');
        await initializeDevice();

        console.log('Applying saved configuration to device...');
        await applyConfiguration(configManager.config);

        
        console.log('Creating main window...');
        mainWindow = new BrowserWindow({
            width: 1024,
            height: 768,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('Renderer process finished loading. Sending config to UI.');
            mainWindow.webContents.send('loadConfig', configManager.config);
        });
        
        mainWindow.on('close', () => {
            console.log('Main window is closing.');
        });
        
        mainWindow.on('closed', () => {
            console.log('Main window has been closed.');
            mainWindow = null;
        });

        await mainWindow.loadFile('index.html');
        console.log('loadFile command issued.');

    } catch (error) {
        console.error('FATAL: Error during startup:', error);
        app.quit();
    }
}


async function ensureDevice() {
    if (!device) {
        console.log('Device not initialized, initializing now...');
        await initializeDevice();
    }
    return device;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
    
    if (configManager) {
        await configManager.cleanup();
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async (event) => {
    
    event.preventDefault();
    
    
    if (configManager) {
        await configManager.cleanup();
    }
    
    
    app.exit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


ipcMain.handle('setBrightness', async (event, brightness) => {
    try {
        const dev = await ensureDevice();
        dev.setBrightness(brightness);
        await configManager.updateBrightness(brightness);
        return true;
    } catch (error) {
        console.error('Error setting brightness:', error);
        return false;
    }
});

ipcMain.handle('setButtonImage', async (event, { buttonIndex, imagePath }) => {
    try {
        const dev = await ensureDevice();
        
        
        const image = await Jimp.read(imagePath);
        image.rotate(90).flip(false, true).resize(72, 72);
        
        
        const { data } = image.bitmap;
        const bgrBuffer = Buffer.alloc(72 * 72 * 3);
        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
            bgrBuffer[j] = data[i + 2];
            bgrBuffer[j + 1] = data[i + 1];
            bgrBuffer[j + 2] = data[i];
        }
        await dev.setButtonImage(buttonIndex, bgrBuffer);
        
        
        const base64 = await image.getBase64Async(Jimp.MIME_PNG);
        
        await configManager.updateButton(buttonIndex, {
            type: 'image',
            base64: base64,
            color: null
        });
        return true;
    } catch (error) {
        console.error('Error setting button image:', error);
        return false;
    }
});

ipcMain.handle('setButtonColor', async (event, { buttonIndex, color }) => {
    try {
        const dev = await ensureDevice();
        await dev.setButtonColor(buttonIndex, color);
        await configManager.updateButton(buttonIndex, {
            type: 'color',
            color: `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`,
            base64: null
        });
        return true;
    } catch (error) {
        console.error('Error setting button color:', error);
        return false;
    }
});
