const robot = require('robotjs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class MacroRecorder {
    constructor() {
        this.macros = new Map();
        this.isRecording = false;
        this.currentMacro = [];
        this.recordingName = '';
        this.macrosDir = './macros';
        
        
        if (!fs.existsSync(this.macrosDir)) {
            fs.mkdirSync(this.macrosDir);
        }
        
        this.setupInterface();
        this.loadMacros();
    }
    
    setupInterface() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        console.log('🎹 Keyboard Macro Recorder');
        console.log('Commands:');
        console.log('  record <name>  - Start recording a macro');
        console.log('  stop           - Stop recording');
        console.log('  play <name>    - Play a macro');
        console.log('  list           - List all macros');
        console.log('  save <name>    - Save macro to file');
        console.log('  load <name>    - Load macro from file');
        console.log('  delete <name>  - Delete a macro');
        console.log('  help           - Show this help');
        console.log('  exit           - Exit the program');
        console.log('');
        
        this.showPrompt();
    }
    
    showPrompt() {
        const status = this.isRecording ? `[RECORDING: ${this.recordingName}]` : '[READY]';
        this.rl.question(`${status} > `, (input) => {
            this.handleCommand(input.trim());
        });
    }
    
    handleCommand(input) {
        const [command, ...args] = input.split(' ');
        const name = args.join(' ');
        
        switch (command.toLowerCase()) {
            case 'record':
                if (!name) {
                    console.log('❌ Please provide a macro name');
                    break;
                }
                this.startRecording(name);
                break;
                
            case 'stop':
                this.stopRecording();
                break;
                
            case 'play':
                if (!name) {
                    console.log('❌ Please provide a macro name');
                    break;
                }
                this.playMacro(name);
                break;
                
            case 'list':
                this.listMacros();
                break;
                
            case 'save':
                if (!name) {
                    console.log('❌ Please provide a macro name');
                    break;
                }
                this.saveMacro(name);
                break;
                
            case 'load':
                if (!name) {
                    console.log('❌ Please provide a macro name');
                    break;
                }
                this.loadMacro(name);
                break;
                
            case 'delete':
                if (!name) {
                    console.log('❌ Please provide a macro name');
                    break;
                }
                this.deleteMacro(name);
                break;
                
            case 'help':
                this.showHelp();
                break;
                
            case 'exit':
                console.log('👋 Goodbye!');
                this.rl.close();
                return;
                
            default:
                if (this.isRecording) {
                    this.recordKeystrokes(input);
                } else {
                    console.log('❌ Unknown command. Type "help" for available commands.');
                }
        }
        
        this.showPrompt();
    }
    
    startRecording(name) {
        if (this.isRecording) {
            console.log('❌ Already recording. Stop current recording first.');
            return;
        }
        
        this.isRecording = true;
        this.recordingName = name;
        this.currentMacro = [];
        console.log(`🔴 Recording macro "${name}". Type your keystrokes or commands:`);
        console.log('   - Type text normally to record keystrokes');
        console.log('   - Use special commands: {enter}, {tab}, {space}, {backspace}');
        console.log('   - Use modifiers: {ctrl+c}, {alt+tab}, etc.');
        console.log('   - Type "stop" to finish recording');
    }
    
    stopRecording() {
        if (!this.isRecording) {
            console.log('❌ Not currently recording.');
            return;
        }
        
        this.macros.set(this.recordingName, [...this.currentMacro]);
        console.log(`✅ Macro "${this.recordingName}" recorded with ${this.currentMacro.length} actions.`);
        
        this.isRecording = false;
        this.recordingName = '';
        this.currentMacro = [];
    }
    
    recordKeystrokes(input) {
        const timestamp = Date.now();
        
        
        if (input.includes('{') && input.includes('}')) {
            const commands = input.match(/\{[^}]+\}/g) || [];
            let remainingInput = input;
            
            commands.forEach(cmd => {
                const cleanCmd = cmd.slice(1, -1).toLowerCase();
                remainingInput = remainingInput.replace(cmd, '');
                
                if (cleanCmd.includes('+')) {
                    
                    const parts = cleanCmd.split('+');
                    this.currentMacro.push({
                        type: 'keyCombo',
                        keys: parts,
                        timestamp
                    });
                } else {
                    
                    this.currentMacro.push({
                        type: 'specialKey',
                        key: cleanCmd,
                        timestamp
                    });
                }
            });
            
            
            if (remainingInput.trim()) {
                this.currentMacro.push({
                    type: 'text',
                    content: remainingInput.trim(),
                    timestamp
                });
            }
        } else {
            
            this.currentMacro.push({
                type: 'text',
                content: input,
                timestamp
            });
        }
        
        console.log(`📝 Recorded: ${input}`);
    }
    
    async playMacro(name) {
        const macro = this.macros.get(name);
        if (!macro) {
            console.log(`❌ Macro "${name}" not found.`);
            return;
        }
        
        console.log(`▶️  Playing macro "${name}"...`);
        console.log('⏳ Starting in 3 seconds... (Switch to your target application)');
        
        
        await this.sleep(3000);
        
        for (let i = 0; i < macro.length; i++) {
            const action = macro[i];
            
            try {
                switch (action.type) {
                    case 'text':
                        robot.typeString(action.content);
                        break;
                        
                    case 'specialKey':
                        this.executeSpecialKey(action.key);
                        break;
                        
                    case 'keyCombo':
                        this.executeKeyCombo(action.keys);
                        break;
                }
                
                
                await this.sleep(50);
                
            } catch (error) {
                console.log(`❌ Error executing action ${i + 1}: ${error.message}`);
            }
        }
        
        console.log('✅ Macro playback completed.');
    }
    
    executeSpecialKey(key) {
        const keyMap = {
            'enter': 'enter',
            'tab': 'tab',
            'space': 'space',
            'backspace': 'backspace',
            'delete': 'delete',
            'escape': 'escape',
            'up': 'up',
            'down': 'down',
            'left': 'left',
            'right': 'right',
            'home': 'home',
            'end': 'end',
            'pageup': 'pageup',
            'pagedown': 'pagedown'
        };
        
        const mappedKey = keyMap[key] || key;
        robot.keyTap(mappedKey);
    }
    
    executeKeyCombo(keys) {
        const modifiers = [];
        let mainKey = '';
        
        keys.forEach(key => {
            if (['ctrl', 'alt', 'shift', 'cmd', 'meta'].includes(key)) {
                modifiers.push(key === 'meta' ? 'cmd' : key);
            } else {
                mainKey = key;
            }
        });
        
        if (mainKey) {
            robot.keyTap(mainKey, modifiers);
        }
    }
    
    listMacros() {
        if (this.macros.size === 0) {
            console.log('📭 No macros recorded yet.');
            return;
        }
        
        console.log('📋 Available macros:');
        this.macros.forEach((macro, name) => {
            console.log(`  • ${name} (${macro.length} actions)`);
        });
    }
    
    saveMacro(name) {
        const macro = this.macros.get(name);
        if (!macro) {
            console.log(`❌ Macro "${name}" not found.`);
            return;
        }
        
        const filePath = path.join(this.macrosDir, `${name}.json`);
        try {
            fs.writeFileSync(filePath, JSON.stringify(macro, null, 2));
            console.log(`💾 Macro "${name}" saved to ${filePath}`);
        } catch (error) {
            console.log(`❌ Failed to save macro: ${error.message}`);
        }
    }
    
    loadMacro(name) {
        const filePath = path.join(this.macrosDir, `${name}.json`);
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const macro = JSON.parse(data);
            this.macros.set(name, macro);
            console.log(`📂 Macro "${name}" loaded from file (${macro.length} actions)`);
        } catch (error) {
            console.log(`❌ Failed to load macro: ${error.message}`);
        }
    }
    
    loadMacros() {
        try {
            const files = fs.readdirSync(this.macrosDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            jsonFiles.forEach(file => {
                const name = path.basename(file, '.json');
                try {
                    const data = fs.readFileSync(path.join(this.macrosDir, file), 'utf8');
                    const macro = JSON.parse(data);
                    this.macros.set(name, macro);
                } catch (error) {
                    console.log(`⚠️  Failed to load ${file}: ${error.message}`);
                }
            });
            
            if (jsonFiles.length > 0) {
                console.log(`📂 Loaded ${jsonFiles.length} macro(s) from files.`);
            }
        } catch (error) {
            
        }
    }
    
    deleteMacro(name) {
        if (!this.macros.has(name)) {
            console.log(`❌ Macro "${name}" not found.`);
            return;
        }
        
        this.macros.delete(name);
        
        
        const filePath = path.join(this.macrosDir, `${name}.json`);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            console.log(`🗑️  Macro "${name}" deleted.`);
        } catch (error) {
            console.log(`⚠️  Macro deleted from memory, but failed to delete file: ${error.message}`);
        }
    }
    
    showHelp() {
        console.log('\n🎹 Keyboard Macro Recorder Help');
        console.log('================================');
        console.log('Commands:');
        console.log('  record <name>  - Start recording keystrokes');
        console.log('  stop           - Stop current recording');
        console.log('  play <name>    - Replay recorded macro');
        console.log('  list           - Show all available macros');
        console.log('  save <name>    - Save macro to file');
        console.log('  load <name>    - Load macro from file');
        console.log('  delete <name>  - Delete a macro');
        console.log('  exit           - Quit the program');
        console.log('\nSpecial keystroke syntax while recording:');
        console.log('  {enter}        - Enter key');
        console.log('  {tab}          - Tab key');
        console.log('  {space}        - Space key');
        console.log('  {backspace}    - Backspace key');
        console.log('  {ctrl+c}       - Ctrl+C combination');
        console.log('  {alt+tab}      - Alt+Tab combination');
        console.log('  {shift+home}   - Shift+Home combination');
        console.log('\nExample workflow:');
        console.log('  1. record my_macro');
        console.log('  2. Hello World{enter}');
        console.log('  3. stop');
        console.log('  4. play my_macro');
        console.log('');
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}


try {
    robot.getScreenSize();
} catch (error) {
    console.log('❌ robotjs library not found or not working properly.');
    console.log('📦 Please install it with: npm install robotjs');
    console.log('⚠️  Note: robotjs requires native compilation and may need additional setup.');
    process.exit(1);
}


const recorder = new MacroRecorder();
