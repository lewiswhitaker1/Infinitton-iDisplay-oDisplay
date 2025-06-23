# Infinitton iDisplay Control

A Node.js application to control the Infinitton iDisplay device. This will be updated with a GUI and lots of functionality, this is just a proof of concept for now.

## Prerequisites

- Node.js installed on your system
- Infinitton iDisplay device connected via USB

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the application:
```bash
npm start
```

The application will:
1. Find and connect to your Infinitton iDisplay
2. Set the brightness to 100%
3. Set all buttons to random colours
4. Listen for keystrokes
5. Each keystroke will change the colour of that button