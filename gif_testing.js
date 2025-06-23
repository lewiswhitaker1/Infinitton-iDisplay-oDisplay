const HID = require('node-hid');
const sharp = require('sharp');
const fs = require('fs');
const gifFrames = require('gif-frames');

const VENDOR_ID = 0xFFFF;
const PRODUCT_ID = 0x1F40;
const REPORT_SIZE = 0x1F;

const CMD_BRIGHTNESS = 0x11;
const CMD_BUTTON_CONFIG = 0x12;

const BUTTON_SIZE = 72;
const HEADER1 = Buffer.from([
    0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x55, 0xaa, 0xaa, 0x55, 0x11, 0x22, 0x33,
    0x44, 0x42, 0x4d, 0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00, 0x00, 0x00, 0x28,
    0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x01, 0x00, 0x18, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xc0, 0x3c, 0x00, 0x00, 0xc4, 0x0e, 0x00, 0x00, 0xc4, 0x0e, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

const HEADER2 = Buffer.from([
    0x02, 0x40, 0x1f, 0x00, 0x00, 0xb6, 0x1d, 0x00, 0x00, 0x55, 0xaa, 0xaa, 0x55, 0x11, 0x22, 0x33,
    0x44
]);

const BUTTON_CODES = [
    0x100, 0x200, 0x400, 0x800, 0x1000, 0x2000, 0x4000, 0x8000,
    0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40
];

function sleep(ms) {
    if (ms <= 0) {
        return new Promise(resolve => process.nextTick(resolve));
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomColor() {
    return {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256)
    };
}

function openDevice() {
    const devices = HID.devices();
    const deviceInfo = devices.find(d => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID);
    
    if (!deviceInfo) {
        throw new Error('Infinitton iDisplay not found');
    }

    return new HID.HID(deviceInfo.path);
}

function setBrightness(device, brightness) {
    const report = Buffer.alloc(REPORT_SIZE);
    report[0] = CMD_BRIGHTNESS;
    report[1] = brightness;
    device.sendFeatureReport(report);
}

function createSolidColorImageData(r, g, b) {
    const imageData = Buffer.alloc(BUTTON_SIZE * BUTTON_SIZE * 3);
    
    for (let i = 0; i < imageData.length; i += 3) {
        imageData[i] = b;
        imageData[i + 1] = g;
        imageData[i + 2] = r;
    }
    
    return imageData;
}

async function convertToBGR(imageBuffer) {
    const { data } = await sharp(imageBuffer)
        .resize(BUTTON_SIZE, BUTTON_SIZE)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const bgrBuffer = Buffer.alloc(BUTTON_SIZE * BUTTON_SIZE * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
        bgrBuffer[j] = data[i + 2]; 
        bgrBuffer[j + 1] = data[i + 1]; 
        bgrBuffer[j + 2] = data[i]; 
    }
    return bgrBuffer;
}

async function createImageDataFromFile(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    return await convertToBGR(imageBuffer);
}

async function setButtonImageFromFile(device, buttonIndex, imagePath) {
    const imageData = await createImageDataFromFile(imagePath);
    await setButtonImage(device, buttonIndex, imageData);
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

async function setButtonImageFromGif(device, buttonIndex, gifPath) {
    if (!fs.existsSync(gifPath)) {
        console.log(`GIF file not found at ${gifPath}, skipping animation.`);
        return;
    }

    const frameData = await gifFrames({ url: gifPath, frames: 'all', outputType: 'png', cumulative: true });

    if (frameData.length === 0) {
        console.error(`No frames found in ${gifPath}`);
        return;
    }

    console.log('Processing GIF frames, please wait...');
    const processedFrames = await Promise.all(
        frameData.map(async frame => {
            const imageBuffer = await streamToBuffer(frame.getImage());
            return await convertToBGR(imageBuffer);
        })
    );
    console.log('GIF processing complete. Starting animation.');

    try {
        while (true) {
            for (const frameImageData of processedFrames) {
                await setButtonImage(device, buttonIndex, frameImageData);
            }
        }
    } catch (error) {
        console.error('Error processing GIF:', error);
    }
}

async function setButtonImage(device, buttonIndex, imageData) {
    const totalSize = 0x3EA2;
    const buffer = Buffer.alloc(totalSize);
    
    HEADER1.copy(buffer, 0);
    HEADER2.copy(buffer, 0x1F51);
    
    imageData.copy(buffer, HEADER1.length, 0, 0x1F51 - HEADER1.length);
    imageData.copy(buffer, 0x1F51 + HEADER2.length, 0x1F51 - HEADER1.length);
    
    device.write(buffer.slice(0, 0x1F51));
    await sleep(0.1);

    device.write(buffer.slice(0x1F51));
    await sleep(0.1);

    const configReport = Buffer.from([
        0x12, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00
    ]);
    configReport[4] = buttonIndex;
    device.sendFeatureReport(configReport);
}

async function setRandomButtonColors(device) {
    for (let buttonIndex = 1; buttonIndex <= 15; buttonIndex++) {
        const color = getRandomColor();
        console.log(`Setting button ${buttonIndex} to RGB(${color.r}, ${color.g}, ${color.b})`);
        const imageData = createSolidColorImageData(color.r, color.g, color.b);
        await setButtonImage(device, buttonIndex, imageData);
    }
}

function getButtonNumber(data) {
    const buttonValue = (data[1] << 8) | data[2];
    const buttonIndex = BUTTON_CODES.indexOf(buttonValue);
    return buttonIndex >= 0 ? buttonIndex + 1 : -1;
}

let lastButtonPress = {
    time: 0,
    button: -1
};

function handleButtonPress(data) {
    const button = getButtonNumber(data);
    if (button > 0) {
        const now = Date.now();
        if (button !== lastButtonPress.button || (now - lastButtonPress.time) >= 1) {
            lastButtonPress.time = now;
            lastButtonPress.button = button;
            console.log('Button pressed:', button);
            return button;
        }
    }
    return -1;
}

async function main() {
    try {
        console.log('Looking for Infinitton iDisplay...');
        const device = openDevice();
        console.log('Device found and opened');

        console.log('Setting brightness to 100%');
        setBrightness(device, 100);

        console.log('Setting random colors for all buttons...');
        await setRandomButtonColors(device);

        console.log('Listening for button presses...');
        
        setButtonImageFromGif(device, 1, 'animation.gif').catch(console.error);
        
        device.on('data', async data => {
            const button = handleButtonPress(data);
            if (button > 0) {
                const color = getRandomColor();
                console.log(`Button ${button} pressed - setting new color RGB(${color.r}, ${color.g}, ${color.b})`);
                const imageData = createSolidColorImageData(color.r, color.g, color.b);
                await setButtonImage(device, button, imageData);
            }
        });

        process.on('SIGINT', () => {
            console.log('Closing device...');
            device.close();
            process.exit();
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main().catch(console.error);
