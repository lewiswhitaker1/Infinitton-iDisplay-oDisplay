const HID = require('node-hid');
const sharp = require('sharp');
const fs = require('fs');
const gifFrames = require('gif-frames');
const crypto = require('crypto');
const path = require('path');

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

async function convertToBGR(imageBuffer, rotation = 0) {
    let image = sharp(imageBuffer);
    if (rotation) {
        image = image.rotate(rotation);
    }

    const { data } = await image
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

function bufferToJson(buffer) {
    return { type: 'Buffer', data: buffer.toJSON().data };
}

function jsonToBuffer(json) {
    return Buffer.from(json.data);
}

class AsyncLock {
    constructor() {
        this.disable = () => {};
        this.promise = Promise.resolve();
    }

    acquire() {
        const oldPromise = this.promise;
        this.promise = new Promise(resolve => {
            this.disable = resolve;
        });
        return oldPromise;
    }

    release() {
        this.disable();
    }
}

const deviceLock = new AsyncLock();
const activeAnimations = new Map();

function pauseAllAnimations() {
    for (const animation of activeAnimations.values()) {
        animation.isPlaying = false;
    }
}

function resumeAllAnimations() {
    for (const animation of activeAnimations.values()) {
        animation.isPlaying = true;
    }
}

async function runAnimationLoop() {
    while (true) {
        const now = Date.now();
        if (activeAnimations.size > 0) {
            for (const animation of activeAnimations.values()) {
                if (animation.isPlaying && now >= animation.nextFrameTime) {
                    const frame = animation.frames[animation.currentFrame];
                    setButtonImage(animation.device, animation.buttonIndex, frame.imageData).catch(err => {
                        console.error(`Failed to set image for button ${animation.buttonIndex}`, err);
                    });
                    
                    animation.currentFrame = (animation.currentFrame + 1) % animation.frames.length;
                    animation.nextFrameTime = now + frame.delay;
                }
            }
        }
        await sleep(1);
    }
}

async function setButtonImageFromGif(device, buttonIndex, gifPath, options = {}) {
    if (!fs.existsSync(gifPath)) {
        console.log(`GIF file not found at ${gifPath}, skipping animation.`);
        return;
    }

    const cacheDir = './.cache';
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
    }
    const hash = crypto.createHash('md5').update(gifPath + JSON.stringify(options)).digest('hex');
    const cacheFileName = `${path.basename(gifPath)}-${hash}.json`;
    const cacheFilePath = path.join(cacheDir, cacheFileName);

    let processedFrames;

    if (fs.existsSync(cacheFilePath)) {
        console.log(`Loading frames from cache for ${gifPath}...`);
        const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
        processedFrames = cachedData.map(frame => ({
            imageData: jsonToBuffer(frame.imageData),
            delay: frame.delay
        }));
    } else {
        const frameData = await gifFrames({ url: gifPath, frames: 'all', outputType: 'png', cumulative: true });

        if (frameData.length === 0) {
            console.error(`No frames found in ${gifPath}`);
            return;
        }

        console.log(`Processing GIF frames for button ${buttonIndex}, please wait...`);
        processedFrames = await Promise.all(
            frameData.map(async frame => {
                const imageBuffer = await streamToBuffer(frame.getImage());
                const frameImageData = await convertToBGR(imageBuffer, options.rotate);
                const delay = frame.frameInfo.delay * 10;
                return {
                    imageData: frameImageData,
                    delay: delay > 20 ? delay : 100
                };
            })
        );
        console.log(`GIF processing for button ${buttonIndex} complete.`);

        console.log(`Caching frames for ${gifPath}...`);
        const serializableFrames = processedFrames.map(frame => ({
            imageData: bufferToJson(frame.imageData),
            delay: frame.delay
        }));
        fs.writeFileSync(cacheFilePath, JSON.stringify(serializableFrames, null, 2));
        console.log('Frames cached.');
    }

    const animation = {
        frames: processedFrames,
        isPlaying: true,
        buttonIndex: buttonIndex,
        currentFrame: 0,
        device: device,
        nextFrameTime: Date.now()
    };

    activeAnimations.set(buttonIndex, animation);
}

async function setButtonImage(device, buttonIndex, imageData) {
    await deviceLock.acquire();
    try {
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
    } finally {
        deviceLock.release();
    }
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

async function handleButtonPress(device, data) {
    const button = getButtonNumber(data);
    if (button > 0) {
        const now = Date.now();
        if (button !== lastButtonPress.button || (now - lastButtonPress.time) >= 1) {
            lastButtonPress.time = now;
            lastButtonPress.button = button;
            console.log('Button pressed:', button);

            pauseAllAnimations();
            await sleep(10); 

            
            if (activeAnimations.has(button)) {
                activeAnimations.delete(button);
            }

            
            const color = getRandomColor();
            console.log(`Button ${button} pressed - setting new color RGB(${color.r}, ${color.g}, ${color.b})`);
            const imageData = createSolidColorImageData(color.r, color.g, color.b);
            await setButtonImage(device, button, imageData);

            await sleep(10); 
            resumeAllAnimations();
        }
    }
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
        await setButtonImageFromGif(device, 15, 'back-arrow.gif', { rotate: 90 });
        
        runAnimationLoop().catch(console.error);

        device.on('data', async data => {
            await handleButtonPress(device, data);
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
