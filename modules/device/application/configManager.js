const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ConfigManager {
    constructor() {
        
        const appDataPath = process.env.APPDATA || (
            process.platform === 'darwin' 
                ? path.join(os.homedir(), 'Library', 'Application Support')
                : path.join(os.homedir(), '.config')
        );
        
        this.configPath = path.join(appDataPath, 'InfinittonControl');
        this.configFile = path.join(this.configPath, 'config.json');
        console.log('Config file path:', this.configFile);
        
        this.saveTimeout = null;
        this.SAVE_DELAY = 100; 
    }

    async initialize() {
        try {
            console.log('Creating config directory if needed:', this.configPath);
            await fs.mkdir(this.configPath, { recursive: true });
            console.log('Loading initial configuration...');
            await this.loadConfig();
        } catch (error) {
            console.error('Error initializing config:', error);
            console.log('Using default configuration');
            this.config = this.getDefaultConfig();
        }
    }

    getDefaultConfig() {
        console.log('Creating default configuration');
        return {
            brightness: 100,
            buttons: Array(15).fill(null).map((_, i) => ({
                id: i + 1,
                type: 'color',
                color: '#2a2a2a',
                base64: null
            }))
        };
    }

    async loadConfig() {
        try {
            console.log('Reading config file:', this.configFile);
            const data = await fs.readFile(this.configFile, 'utf8');
            console.log('Parsing configuration data');
            this.config = JSON.parse(data);
            console.log('Configuration loaded successfully');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No existing config file found, creating default configuration');
            } else {
                console.error('Error loading config:', error);
            }
            this.config = this.getDefaultConfig();
            await this.saveConfig();
        }
        return this.config;
    }

    debouncedSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(async () => {
            await this.saveConfig();
            this.saveTimeout = null;
        }, this.SAVE_DELAY);
    }

    async saveConfig() {
        try {
            console.log('Preparing to save configuration');
            const configString = JSON.stringify(this.config, null, 2);
            await fs.writeFile(this.configFile, configString);
            console.log('Configuration saved to:', this.configFile);
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    async updateButton(buttonId, data) {
        console.log(`Updating button ${buttonId} with:`, data);
        const button = this.config.buttons.find(b => b.id === buttonId);
        if (button) {
            Object.assign(button, data);
            this.debouncedSave();
        } else {
            console.warn(`Button ${buttonId} not found in configuration`);
        }
    }

    async updateBrightness(brightness) {
        console.log('Updating brightness to:', brightness);
        this.config.brightness = brightness;
        this.debouncedSave();
    }

    async clearButton(buttonId) {
        console.log(`Clearing configuration for button ${buttonId}`);
        const button = this.config.buttons.find(b => b.id === buttonId);
        if (button) {
            
            const defaultConfig = this.getDefaultConfig().buttons.find(b => b.id === buttonId);
            
            Object.assign(button, defaultConfig);
            this.debouncedSave();
        } else {
            console.warn(`Button ${buttonId} not found in configuration to clear`);
        }
    }

    async cleanup() {
        console.log('Running configuration cleanup');
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            await this.saveConfig();
        }
    }
}

module.exports = ConfigManager;
