# Parts Pal Hub - Desktop Application

This application can be built as a standalone desktop application using Electron.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- For Windows builds: Windows 10/11
- For Mac builds: macOS with Xcode command line tools
- For Linux builds: Linux with build essentials

## Setup Instructions

### 1. Export and Clone the Project

1. Click "Export to Github" in Lovable to export the project
2. Clone the repository to your local machine:
   ```bash
   git clone <your-repo-url>
   cd <project-folder>
   ```

### 2. Install Dependencies

```bash
npm install
```

### 3. Development Mode

Run the app in development mode with hot-reload:

```bash
# Terminal 1: Start Vite dev server
npm run dev

# Terminal 2: Start Electron (after Vite is running)
npm run electron:dev
```

Or use the combined command:
```bash
npm run electron:start
```

### 4. Build for Production

#### Build for your current platform:
```bash
npm run electron:build
```

#### Build for specific platforms:

**Windows:**
```bash
npm run electron:build:win
```

**macOS:**
```bash
npm run electron:build:mac
```

**Linux:**
```bash
npm run electron:build:linux
```

### 5. Find Your Installers

After building, installers will be in the `release/` folder:

- **Windows**: `.exe` installer and portable version
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage` and `.deb` packages

## Package Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Build the web app for production |
| `npm run electron:dev` | Start Electron in development mode |
| `npm run electron:start` | Start both Vite and Electron together |
| `npm run electron:build` | Build desktop app for current platform |
| `npm run electron:build:win` | Build Windows installer |
| `npm run electron:build:mac` | Build macOS installer |
| `npm run electron:build:linux` | Build Linux packages |

## Troubleshooting

### Windows Build Issues
- Ensure you have Visual Studio Build Tools installed
- Run as Administrator if permission issues occur

### macOS Build Issues
- Install Xcode command line tools: `xcode-select --install`
- For signing/notarization, you'll need an Apple Developer account

### Linux Build Issues
- Install build essentials: `sudo apt install build-essential`
- For AppImage, install FUSE: `sudo apt install fuse`

## Features in Desktop Mode

- Native window controls
- Application menu
- File system access (for exports/imports)
- Offline capability
- Auto-updates (can be configured)
- Native notifications

## Notes

- The app connects to your Supabase backend, so internet connection is required for full functionality
- Local data caching can be implemented for offline mode
- Receipt printing uses the system's default printer
