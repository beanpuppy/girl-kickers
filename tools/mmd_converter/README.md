# MMD to Door Kickers 2 Converter

Scripts for converting MMD (PMX) models to Door Kickers 2's KHM format.

## Requirements

- Blender (in PATH)
- [mmd_tools](https://github.com/UuuNyaa/blender_mmd_tools) addon installed in Blender
- [khm_tools](../blender/) addon installed in Blender
- [Voxel Heat Diffuse Skinning](https://superhivemarket.com/products/voxel-heat-diffuse-skinning) addon (optional, for better weight results)

## Scripts

### prepare_mmd.py

Prepares an MMD model for use in DK2:

1. Imports the PMX file
2. Removes rigid body physics and MMD armature
3. Scales the model to 1.92m height
4. Decimates to 40k faces if needed
5. Creates new UVs and bakes all materials to a single texture
6. Saves as a .blend file with the baked texture as a PNG
7. Converts the PNG to DDS (requires ImageMagick)

```bash
blender --background --python tools/mmd_converter/prepare_mmd.py -- --pmx /path/to/model.pmx
```

Output goes to `tools/mmd_converter/output/`.

### add_weights.py

Adds a DK2 armature and transfers weights from a reference KHM model:

1. Opens the prepared .blend file
2. Imports armature and mesh from a reference KHM
3. Transfers weights using Blender's Data Transfer modifier
4. Parents collision mesh and saves

```bash
blender --background --python tools/mmd_converter/add_weights.py -- --blend output/model.blend --reference /path/to/reference.khm
```

For better weight results, open the .blend in Blender and use Voxel Heat Diffuse Skinning manually instead of the automatic Data Transfer.

## Workflow

1. Run `prepare_mmd.py` to prepare the mesh and texture
2. Run `add_weights.py` to add the armature and basic weights
3. Open the .blend in Blender, adjust weights with Voxel Heat Diffuse Skinning if needed
4. Export to KHM using khm_tools
5. Fix weights manually in weight paint mode (automatic methods rarely get everything right)
6. DDS texture is already in `output/` if ImageMagick is installed, otherwise convert the PNG to DDS manually
