"""
MMD to DK2 Model Preparation Script

This script prepares MMD (PMX) models for use in Door Kickers 2 by:
1. Importing the PMX file via mmd_tools
2. Removing rigid body physics objects
3. Removing the MMD armature
4. Scaling the model to 1.9m height
5. Decimating if over 40k faces
6. Creating new UVs with Smart UV Project
7. Baking all materials to a single texture
8. Replacing materials with the baked texture
9. Converting the texture to DDS (requires ImageMagick)
"""

import shutil
import subprocess
from pathlib import Path

import bpy

# Configuration
TARGET_HEIGHT = 1.92  # metres
MAX_FACES = 40000
TEXTURE_SIZE = 4096

# Get the script's directory for output
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"


def get_pmx_path():
    """Open file dialog to select PMX file."""
    # For now, we'll use a simple approach - check if there's a filepath argument
    # In practice, you'd run this interactively
    import sys

    for i, arg in enumerate(sys.argv):
        if arg == "--pmx" and i + 1 < len(sys.argv):
            return sys.argv[i + 1]

    # If running interactively, we need to use the file browser
    # This is a placeholder - the actual implementation would use bpy.ops.wm.fileselect
    raise ValueError("No PMX file specified. Use --pmx /path/to/file.pmx")


def get_model_name(pmx_path):
    """Extract model name from PMX filename."""
    import sys

    for i, arg in enumerate(sys.argv):
        if arg == "--name" and i + 1 < len(sys.argv):
            return sys.argv[i + 1]

    # Default: use PMX filename without extension, cleaned up
    name = Path(pmx_path).stem
    # Remove common prefixes
    for prefix in ["GirlsFrontline ", "GirlsFrontline_"]:
        if name.startswith(prefix):
            name = name[len(prefix) :]
    # Remove "Default" suffix
    if name.endswith("Default"):
        name = name[:-7]
    return name.lower().replace(" ", "_")


def clear_scene():
    """Remove all objects from the scene."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    # Clear orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)
    for block in bpy.data.textures:
        if block.users == 0:
            bpy.data.textures.remove(block)
    for block in bpy.data.images:
        if block.users == 0:
            bpy.data.images.remove(block)


def import_pmx(pmx_path):
    """Import PMX file using mmd_tools."""
    print(f"Importing: {pmx_path}")
    bpy.ops.mmd_tools.import_model(
        filepath=pmx_path,
        scale=0.1,  # Starting scale, will be adjusted
        clean_model=False,
        remove_doubles=False,
    )
    print("Import complete")


def find_main_mesh():
    """Find the main mesh object (the one with the most vertices)."""
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        raise ValueError("No mesh objects found")

    # Find the mesh with the most vertices (that's the main model)
    main_mesh = max(meshes, key=lambda m: len(m.data.vertices))
    print(
        f"Main mesh: {main_mesh.name} ({len(main_mesh.data.vertices)} verts, {len(main_mesh.data.polygons)} faces)"
    )
    return main_mesh


def find_armature():
    """Find the armature object."""
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if armatures:
        return armatures[0]
    return None


def delete_physics_objects(main_mesh):
    """Delete all objects except the main mesh."""
    main_mesh_name = main_mesh.name

    # Delete everything except main mesh using data API directly
    to_delete = [obj for obj in bpy.data.objects if obj.name != main_mesh_name]

    print(f"Deleting {len(to_delete)} objects (keeping {main_mesh_name})")

    for obj in to_delete:
        bpy.data.objects.remove(obj, do_unlink=True)

    # Remove physics collections
    for col_name in ["RigidBodyWorld", "RigidBodyConstraints"]:
        if col_name in bpy.data.collections:
            bpy.data.collections.remove(bpy.data.collections[col_name])

    # Clean up orphan meshes
    for mesh in bpy.data.meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def delete_armature(armature):
    """Delete the armature and unparent the mesh."""
    if armature is None:
        return

    # Find mesh children and unparent them
    for obj in bpy.data.objects:
        if obj.parent == armature:
            obj.parent = None
            # Clear armature modifier if present
            for mod in obj.modifiers:
                if mod.type == "ARMATURE":
                    obj.modifiers.remove(mod)

    # Delete the armature
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.ops.object.delete()
    print("Deleted armature")


def delete_mmd_root():
    """Delete the MMD root empty."""
    for obj in bpy.data.objects:
        if obj.type == "EMPTY" and "_arm" not in obj.name:
            # Check if it's the root (has children that are armature/mesh)
            children_types = [c.type for c in obj.children]
            if "ARMATURE" in children_types or "MESH" in children_types:
                bpy.ops.object.select_all(action="DESELECT")
                obj.select_set(True)
                bpy.ops.object.delete()
                print(f"Deleted MMD root: {obj.name}")
                return


def delete_shape_keys(mesh):
    """Delete all shape keys from the mesh."""
    if mesh.data.shape_keys is None:
        return

    num_keys = len(mesh.data.shape_keys.key_blocks)
    if num_keys == 0:
        return

    # Remove all shape keys
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.shape_key_remove(all=True)
    print(f"Deleted {num_keys} shape keys")


def scale_to_height(mesh, target_height):
    """Scale mesh to target height."""
    # Get current height (Z dimension)
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh

    # Get bounding box height
    bbox = mesh.bound_box
    min_z = min(v[2] for v in bbox)
    max_z = max(v[2] for v in bbox)
    current_height = (max_z - min_z) * mesh.scale[2]

    if current_height == 0:
        print("Warning: mesh has zero height")
        return

    scale_factor = target_height / current_height
    mesh.scale = (scale_factor, scale_factor, scale_factor)

    # Apply scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Recalculate to verify
    bbox = mesh.bound_box
    new_height = max(v[2] for v in bbox) - min(v[2] for v in bbox)
    print(
        f"Scaled from {current_height:.3f}m to {new_height:.3f}m (target: {target_height}m)"
    )


def decimate_mesh(mesh, max_faces):
    """Decimate mesh if it exceeds max_faces."""
    current_faces = len(mesh.data.polygons)

    if current_faces <= max_faces:
        print(f"Mesh has {current_faces} faces, no decimation needed")
        return

    ratio = max_faces / current_faces
    print(f"Decimating from {current_faces} to ~{max_faces} faces (ratio: {ratio:.3f})")

    # Add decimate modifier
    bpy.context.view_layer.objects.active = mesh
    mod = mesh.modifiers.new(name="Decimate", type="DECIMATE")
    mod.ratio = ratio
    mod.use_collapse_triangulate = True

    # Apply modifier
    bpy.ops.object.modifier_apply(modifier=mod.name)

    new_faces = len(mesh.data.polygons)
    print(f"Decimated to {new_faces} faces")


def create_new_uvs(mesh):
    """Create new UV map by copying original UVs and repacking islands."""
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh

    # Get original UV layer name
    if not mesh.data.uv_layers:
        raise ValueError("Mesh has no UV layers")

    original_uv = mesh.data.uv_layers[0]
    print(f"Original UV layer: {original_uv.name}")

    # Create new UV map by copying the original
    if "BakedUV" in mesh.data.uv_layers:
        mesh.data.uv_layers.remove(mesh.data.uv_layers["BakedUV"])

    # Copy original UV data to new layer
    new_uv = mesh.data.uv_layers.new(name="BakedUV")

    # Copy UV coordinates
    for i, loop in enumerate(mesh.data.loops):
        new_uv.data[i].uv = original_uv.data[i].uv.copy()

    new_uv.active = True

    # Enter edit mode to repack
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")

    # Average islands scale to normalize sizes
    bpy.ops.uv.average_islands_scale()

    # Pack islands with small margin
    bpy.ops.uv.pack_islands(margin=0.001)

    bpy.ops.object.mode_set(mode="OBJECT")
    print("Created new UVs by repacking original UV islands")


def try_fix_texture_path(img):
    """Try to fix texture path with case-insensitive matching and reload."""
    if img is None or img.has_data:
        return

    filepath = img.filepath
    if not filepath:
        return

    import os

    abs_path = bpy.path.abspath(filepath)

    # Try case-insensitive search for the file
    fixed_path = None

    if os.path.isfile(abs_path):
        fixed_path = abs_path
    else:
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)

        # Fix directory case if needed
        if not os.path.exists(directory):
            parent = os.path.dirname(directory)
            dirname = os.path.basename(directory)
            if os.path.exists(parent):
                for entry in os.listdir(parent):
                    if entry.lower() == dirname.lower():
                        directory = os.path.join(parent, entry)
                        break

        # Find file with case-insensitive match
        if os.path.isdir(directory):
            for entry in os.listdir(directory):
                if entry.lower() == filename.lower():
                    fixed_path = os.path.join(directory, entry)
                    break

    if fixed_path and os.path.isfile(fixed_path):
        # Update filepath and reload
        img.filepath = fixed_path
        img.source = "FILE"
        try:
            img.reload()
            # Force pixel access to actually load the data (lazy loading)
            _ = img.pixels[0]
        except Exception as e:
            print(f"    Failed to load {fixed_path}: {e}")


def ensure_material_has_texture(mat):
    """Ensure material has a working texture for baking.

    Checks for mmd_tools node setup (mmd_base_tex) or standard Principled BSDF.
    If no valid texture exists, creates a solid colour fallback.
    This prevents pink squares in the baked output.
    """
    if mat is None:
        return

    # Ensure nodes are enabled
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # First, check for mmd_tools setup (mmd_base_tex node)
    mmd_base_tex = nodes.get("mmd_base_tex")
    if mmd_base_tex and mmd_base_tex.type == "TEX_IMAGE":
        img = mmd_base_tex.image
        if img:
            # Try to fix path and reload if not loaded
            if not img.has_data:
                try_fix_texture_path(img)

            if img.has_data:
                # Texture exists and loaded successfully
                return

            # Image exists but failed to load
            print(f"  Material '{mat.name}': texture failed to load: {img.filepath}")

    # Check for any TEX_IMAGE node with a valid image
    for node in nodes:
        if node.type == "TEX_IMAGE" and node.image:
            img = node.image
            # Try to fix path and reload if not loaded
            if not img.has_data:
                try_fix_texture_path(img)
            if img.has_data:
                return  # Found a valid texture

    # No valid texture found - need to create a fallback
    # Try to get colour from mmd_shader node group or Principled BSDF
    base_color = (0.8, 0.8, 0.8)  # Default grey

    # Check mmd_shader for diffuse colour
    mmd_shader = nodes.get("mmd_shader")
    if mmd_shader and mmd_shader.type == "GROUP":
        diffuse_input = mmd_shader.inputs.get("Diffuse Color")
        if diffuse_input:
            base_color = diffuse_input.default_value[:3]

    # Or check Principled BSDF
    for node in nodes:
        if node.type == "BSDF_PRINCIPLED":
            base_color_input = node.inputs.get("Base Color")
            if base_color_input:
                base_color = base_color_input.default_value[:3]
            break

    print(
        f"  Material '{mat.name}' has no valid texture, using colour: {base_color[:3]}"
    )

    # Create a small solid colour image
    img_name = f"{mat.name}_solid"
    if img_name in bpy.data.images:
        img = bpy.data.images[img_name]
    else:
        img = bpy.data.images.new(name=img_name, width=4, height=4)
        # Fill with the base colour
        pixels = [base_color[0], base_color[1], base_color[2], 1.0] * 16
        img.pixels = pixels

    # If mmd_base_tex exists, update it; otherwise create new and connect to shader
    if mmd_base_tex:
        mmd_base_tex.image = img
    else:
        # Find shader to connect to
        shader_node = None
        for node in nodes:
            if node.type == "BSDF_PRINCIPLED":
                shader_node = node
                break

        if shader_node:
            base_color_input = shader_node.inputs.get("Base Color")
            if base_color_input:
                tex_node = nodes.new(type="ShaderNodeTexImage")
                tex_node.image = img
                tex_node.location = (
                    shader_node.location.x - 300,
                    shader_node.location.y,
                )
                links.new(tex_node.outputs["Color"], base_color_input)


def bake_textures(mesh, output_path, size=4096):
    """Bake all materials to a single texture."""
    print(f"Baking textures to {output_path}")

    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh

    # Ensure all materials have textures (fix pink squares)
    print("Checking materials for missing textures...")
    for mat in mesh.data.materials:
        ensure_material_has_texture(mat)

    # Create new image for baking
    bake_image = bpy.data.images.new(
        name="BakedTexture", width=size, height=size, alpha=True
    )
    bake_image.filepath = str(output_path)

    # Set up materials to receive the bake
    # We need to add an image texture node to each material pointing to our bake image
    for mat in mesh.data.materials:
        if mat is None:
            continue

        mat.use_nodes = True
        nodes = mat.node_tree.nodes

        # Create image texture node for baking
        bake_node = nodes.new(type="ShaderNodeTexImage")
        bake_node.name = "BakeTarget"
        bake_node.image = bake_image
        bake_node.select = True
        nodes.active = bake_node

    # Configure bake settings
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.device = "CPU"  # Use CPU for compatibility
    bpy.context.scene.cycles.samples = 1
    bpy.context.scene.cycles.bake_type = "DIFFUSE"
    bpy.context.scene.render.bake.use_pass_direct = False
    bpy.context.scene.render.bake.use_pass_indirect = False
    bpy.context.scene.render.bake.use_pass_color = True
    bpy.context.scene.render.bake.margin = 16

    # Perform bake
    print("Baking... (this may take a while)")
    bpy.ops.object.bake(type="DIFFUSE")

    # Save the image
    bake_image.filepath_raw = str(output_path)
    bake_image.file_format = "PNG"
    bake_image.save()
    print(f"Saved baked texture to {output_path}")

    # Pack image into blend file
    bake_image.pack()
    print("Packed image into blend file")

    return bake_image


def replace_materials(mesh, bake_image):
    """Replace all materials with a single material using the baked texture."""
    # Create new material
    new_mat = bpy.data.materials.new(name="BakedMaterial")
    new_mat.use_nodes = True
    nodes = new_mat.node_tree.nodes
    links = new_mat.node_tree.links

    # Clear default nodes
    nodes.clear()

    # Create nodes
    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (300, 0)

    bsdf_node = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf_node.location = (0, 0)

    tex_node = nodes.new(type="ShaderNodeTexImage")
    tex_node.location = (-300, 0)
    tex_node.image = bake_image

    uv_node = nodes.new(type="ShaderNodeUVMap")
    uv_node.location = (-500, 0)
    uv_node.uv_map = "BakedUV"

    # Link nodes
    links.new(uv_node.outputs["UV"], tex_node.inputs["Vector"])
    links.new(tex_node.outputs["Color"], bsdf_node.inputs["Base Color"])
    links.new(bsdf_node.outputs["BSDF"], output_node.inputs["Surface"])

    # Clear existing materials and assign new one
    mesh.data.materials.clear()
    mesh.data.materials.append(new_mat)

    print("Replaced all materials with baked material")


def cleanup_orphans():
    """Remove orphan data blocks."""
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)
    for block in bpy.data.images:
        if block.users == 0:
            bpy.data.images.remove(block)
    for block in bpy.data.armatures:
        if block.users == 0:
            bpy.data.armatures.remove(block)


def main():
    # Get input/output paths
    pmx_path = get_pmx_path()
    model_name = get_model_name(pmx_path)
    output_path = OUTPUT_DIR / f"{model_name}.png"

    print(f"\n{'=' * 60}")
    print("MMD to DK2 Model Preparation")
    print(f"{'=' * 60}")
    print(f"Input:  {pmx_path}")
    print(f"Name:   {model_name}")
    print(f"Output: {output_path}")
    print(f"{'=' * 60}\n")

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Clear scene
    print("Clearing scene...")
    clear_scene()

    # Import PMX
    import_pmx(pmx_path)

    # Find main objects
    main_mesh = find_main_mesh()
    armature = find_armature()

    # Delete armature first
    print("\nRemoving MMD armature...")
    delete_armature(armature)

    # Delete physics junk and empties (keep only main mesh)
    print("\nCleaning up physics objects and empties...")
    delete_physics_objects(main_mesh)

    # Re-find mesh (in case references changed)
    main_mesh = find_main_mesh()

    # Delete shape keys (not needed for DK2)
    print("\nRemoving shape keys...")
    delete_shape_keys(main_mesh)

    # Scale to target height
    print(f"\nScaling to {TARGET_HEIGHT}m...")
    scale_to_height(main_mesh, TARGET_HEIGHT)

    # Decimate if needed
    print(f"\nChecking face count (max: {MAX_FACES})...")
    decimate_mesh(main_mesh, MAX_FACES)

    # Create new UVs
    print("\nCreating new UV layout...")
    create_new_uvs(main_mesh)

    # Bake textures
    print("\nBaking textures...")
    bake_image = bake_textures(main_mesh, output_path, TEXTURE_SIZE)

    # Replace materials
    print("\nReplacing materials...")
    replace_materials(main_mesh, bake_image)

    # Cleanup
    print("\nCleaning up...")
    cleanup_orphans()

    # Rename mesh to model name
    main_mesh.name = model_name

    # Pack all images into blend file so it's self-contained
    bpy.ops.file.pack_all()

    # Save .blend file for inspection
    blend_path = OUTPUT_DIR / f"{model_name}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"Saved blend file to {blend_path}")

    # Convert PNG to DDS (Linux only, requires ImageMagick)
    dds_path = SCRIPT_DIR.parent.parent / "mod" / "models" / "dolls" / f"{model_name}.dds"
    if shutil.which("magick"):
        print(f"\nConverting texture to DDS...")
        try:
            subprocess.run(
                ["magick", str(output_path), "-define", "dds:compression=dxt5", str(dds_path)],
                check=True,
            )
            print(f"Saved DDS to {dds_path}")
        except subprocess.CalledProcessError as e:
            print(f"DDS conversion failed: {e}")
            dds_path = None
    else:
        print("\nImageMagick not found, skipping DDS conversion")
        dds_path = None

    print(f"\n{'=' * 60}")
    print("DONE!")
    print(f"{'=' * 60}")
    print(f"Mesh: {main_mesh.name}")
    print(f"Verts: {len(main_mesh.data.vertices)}")
    print(f"Faces: {len(main_mesh.data.polygons)}")
    print(f"Texture: {output_path}")
    if dds_path:
        print(f"DDS:     {dds_path}")
    print(f"Blend:   {blend_path}")
    print("\nNext step:")
    print(f"  mise run add-weights {blend_path} /path/to/reference.khm")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
