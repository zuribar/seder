# SortBox

<div align="center">

**SortBox** is a free desktop tool for organizing and cleaning up media files — built for VJs, video editors, designers, and content creators.

Scan folders of any size (even entire drives), detect duplicates, and auto-organize everything into sorted folders.

</div>

---

## Features

- **Full Drive Scanning** — Scan folders of any size, including entire SSDs and hard drives with hundreds of thousands of files
- **Smart File Detection** — Automatically identifies 12+ file categories: Video (MP4, MOV, AVI, MKV), Audio (MP3, WAV, FLAC), Images (JPG, PNG, PSD), 3D (OBJ, FBX, Blend), Fonts, LUTs, Presets, Project files, and more
- **Duplicate Finder** — Detects duplicate files using SHA-256 hashing with a two-step verification (partial + full hash)
- **Delete by File Type** — Remove duplicates of a specific format only (e.g., delete all duplicate .DXV files but keep .MP4 copies)
- **Safe Deletion** — All deletions go to the Recycle Bin, never permanent
- **Auto-Organize** — Copy or move files into neatly sorted folders by category and format
- **Detailed File Browser** — Click any category to see all files inside, with pagination for large collections
- **Open in Explorer** — Jump directly to any file's location with one click
- **Live Summary** — File counts, sizes, and category stats update in real-time after every action
- **Hebrew RTL Interface** — Full right-to-left Hebrew UI

## Download

Go to [**Releases**](https://github.com/zuribar/seder/releases) and download:
- **SortBox Setup** — Installer (recommended) — installs the app with a shortcut
- **SortBox Portable** — No installation needed — just run the .exe

## Supported File Types

| Category | Formats |
|----------|---------|
| Video | MP4, MOV, AVI, MKV, WEBM, TS, FLV, and more |
| Images | JPG, PNG, GIF, WEBP, RAW, HEIC, BMP, and more |
| Graphics | PSD, AI, EPS, Sketch, Figma, XD, and more |
| Audio | MP3, WAV, FLAC, AAC, OGG, M4A, and more |
| Projects | AEP, PRPROJ, DRP, ALS, FLP, and more |
| 3D | OBJ, FBX, Blend, C4D, GLTF, STL, and more |
| Plugins | DLL, VST, VST3, AEX, OFX, and more |
| Fonts | TTF, OTF, WOFF, WOFF2, and more |
| Documents | PDF, DOCX, XLSX, PPTX, CSV, and more |
| Archives | ZIP, RAR, 7Z, ISO, DMG, and more |
| LUTs | CUBE, 3DL, LOOK, and more |
| Presets | FFX, XMP, LRTemplate, and more |

## Security

- Electron Context Isolation + Sandbox enabled
- Content Security Policy (CSP)
- XSS protection on all dynamic content
- IPC path validation on all file operations
- Recycle Bin deletion only (never permanent)

## Built With

- [Electron](https://www.electronjs.org/) 28
- Vanilla JavaScript (no frameworks)
- Modern dark theme UI

## License

MIT — free to use, modify, and distribute.
