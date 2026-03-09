# Girl Kickers
Girls' Frontline mod for Door Kickers 2.

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3580762170)

## Development Setup

### Clone the Repository

This repository contains large binary files (models, textures, voice files). For faster cloning, use a shallow clone:

```bash
git clone --depth 1 https://github.com/beanpuppy/girl-kickers.git
cd girl-kickers
```

### Create Symlink to Game Directory

To test the mod in-game, create a symlink from the `mod` directory to the Door Kickers 2 mods folder.

#### Linux
```bash
ln -s /path/to/girl-kickers/mod ~/.local/share/Steam/steamapps/common/DoorKickers2/mods_upload/girl-kickers
```

#### Windows 🤮
```cmd
mklink /D "C:\Program Files (x86)\Steam\steamapps\common\DoorKickers2\mods_upload\girl-kickers" "C:\path\to\girl-kickers\mod"
```

Note: On Windows 🤮, you may need to run the command prompt as Administrator.

### Development Scripts

See [scripts/README.md](scripts/README.md) for information about the Python utilities for processing voice files and other development tasks.

### Development Tools

See [tools/README.md](tools/README.md) for information about asset extraction and 3D modeling tools.
