const HID = require('node-hid');
const Jimp = require('jimp');
const EventEmitter = require('events');

class InfinittonDevice extends EventEmitter {
    constructor() {
        super();
        this.VENDOR_ID = 0xFFFF;
        this.PRODUCT_ID = 0x1F40;
        this.REPORT_SIZE = 0x1F;
        this.BUTTON_SIZE = 72;
        this.CMD_BRIGHTNESS = 0x11;
        this.CMD_BUTTON_CONFIG = 0x12;
        
        this.BUTTON_CODES = [
            0x100, 0x200, 0x400, 0x800, 0x1000, 0x2000, 0x4000, 0x8000,
            0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40
        ];

        this.lastButtonPress = {
            time: 0,
            button: -1
        };

        this.device = this.openDevice();
        this.setupButtonHandling();
    }

    openDevice() {
        const devices = HID.devices();
        const deviceInfo = devices.find(d => d.vendorId === this.VENDOR_ID && d.productId === this.PRODUCT_ID);
        
        if (!deviceInfo) {
            throw new Error('Infinitton iDisplay not found');
        }

        return new HID.HID(deviceInfo.path);
    }

    setupButtonHandling() {
        this.device.on('data', data => {
            const button = this.handleButtonPress(data);
            if (button > 0) {
                this.emit('buttonPress', button);
            }
        });
    }

    setBrightness(brightness) {
        const report = Buffer.alloc(this.REPORT_SIZE);
        report[0] = this.CMD_BRIGHTNESS;
        report[1] = brightness;
        this.device.sendFeatureReport(report);
    }

    async setButtonColor(buttonIndex, { r, g, b }) {
        const imageData = this.createSolidColorImageData(r, g, b);
        await this.setButtonImage(buttonIndex, imageData);
    }

    createSolidColorImageData(r, g, b) {
        const imageData = Buffer.alloc(this.BUTTON_SIZE * this.BUTTON_SIZE * 3);
        
        for (let i = 0; i < imageData.length; i += 3) {
            imageData[i] = b;
            imageData[i + 1] = g;
            imageData[i + 2] = r;
        }
        
        return imageData;
    }

    async setButtonImageFromFile(buttonIndex, imagePath) {
        const imageData = await this.createImageDataFromFile(imagePath);
        await this.setButtonImage(buttonIndex, imageData);
    }

    async createImageDataFromFile(imagePath) {
        const image = await Jimp.read(imagePath);
        image.rotate(90);
        image.flip(false, true);
        image.resize(this.BUTTON_SIZE, this.BUTTON_SIZE);
        const { data } = image.bitmap;
        const bgrBuffer = Buffer.alloc(this.BUTTON_SIZE * this.BUTTON_SIZE * 3);
        
        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
            bgrBuffer[j] = data[i + 2];
            bgrBuffer[j + 1] = data[i + 1];
            bgrBuffer[j + 2] = data[i];
        }
        
        return bgrBuffer;
    }

    async setButtonImage(buttonIndex, imageData) {
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

        const totalSize = 0x3EA2;
        const buffer = Buffer.alloc(totalSize);
        
        HEADER1.copy(buffer, 0);
        HEADER2.copy(buffer, 0x1F51);
        
        imageData.copy(buffer, HEADER1.length, 0, 0x1F51 - HEADER1.length);
        imageData.copy(buffer, 0x1F51 + HEADER2.length, 0x1F51 - HEADER1.length);
        
        this.device.write(buffer.slice(0, 0x1F51));
        await this.sleep(0.1);

        this.device.write(buffer.slice(0x1F51));
        await this.sleep(0.1);

        const configReport = Buffer.from([
            0x12, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0xf6, 0x3c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00
        ]);
        configReport[4] = buttonIndex;
        this.device.sendFeatureReport(configReport);
    }

    getButtonNumber(data) {
        const buttonValue = (data[1] << 8) | data[2];
        const buttonIndex = this.BUTTON_CODES.indexOf(buttonValue);
        return buttonIndex >= 0 ? buttonIndex + 1 : -1;
    }

    handleButtonPress(data) {
        const button = this.getButtonNumber(data);
        if (button > 0) {
            const now = Date.now();
            if (button !== this.lastButtonPress.button || (now - this.lastButtonPress.time) >= 1) {
                this.lastButtonPress.time = now;
                this.lastButtonPress.button = button;
                return button;
            }
        }
        return -1;
    }

    sleep(ms) {
        if (ms <= 0) {
            return new Promise(resolve => process.nextTick(resolve));
        }
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    close() {
        if (this.device) {
            this.device.close();
        }
    }
}

module.exports = InfinittonDevice;
