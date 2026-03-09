#!/usr/bin/env python3
"""
Generate cubebody KHM files from doll KHM files.

Reads each .khm in mod/models/dolls/, preserves the armature (bones, helpers)
and animation data, but replaces the mesh with a tiny skinned triangle weighted
to Bip001 Pelvis (bone id 1). Writes output to mod/models/dolls/cubebodies/.

The cubebody serves as an invisible placeholder so the game's skin system
(IGCS Custom1 slot) can provide the actual visible model.
"""

import os
import struct
import sys

KHM_MAX_OBJECT_NAME = 48
BONE_ENTRY_SIZE = KHM_MAX_OBJECT_NAME + 4 + 4 + 64 + 64  # name + id + parent + matLocal + matGlobal


def read_exact(f, n):
    data = f.read(n)
    if len(data) != n:
        raise EOFError(f"Expected {n} bytes, got {len(data)}")
    return data


def make_cubebody(input_path, output_path):
    with open(input_path, "rb") as f:
        src = f.read()

    pos = 0

    # Header: signature (4) + version (4)
    header = src[pos:pos + 8]
    pos += 8

    # Bones
    num_bones = src[pos]
    pos += 1
    bones_data = src[pos:pos + num_bones * BONE_ENTRY_SIZE]
    pos += num_bones * BONE_ENTRY_SIZE

    # Helpers
    num_helpers = src[pos]
    pos += 1
    helpers_data = src[pos:pos + num_helpers * BONE_ENTRY_SIZE]
    pos += num_helpers * BONE_ENTRY_SIZE

    # Has mesh
    has_mesh = src[pos]
    pos += 1

    if has_mesh:
        # Skip mesh header: name + id + parent + matLocal + matGlobal
        mesh_header = src[pos:pos + KHM_MAX_OBJECT_NAME + 4 + 4 + 64 + 64]
        pos += KHM_MAX_OBJECT_NAME + 4 + 4 + 64 + 64

        # Skip geometry to find where animation data starts
        # We need to walk through the geometry format

        # numVertices
        num_verts = struct.unpack_from("<I", src, pos)[0]
        pos += 4
        # vertices (3 floats each)
        pos += num_verts * 12
        # normals (3 floats each)
        pos += num_verts * 12
        # numIndices
        num_indices = struct.unpack_from("<I", src, pos)[0]
        pos += 4
        # indices (ushort each)
        pos += num_indices * 2
        # face normals (3 floats per face, numIndices/3 faces)
        num_faces = num_indices // 3
        pos += num_faces * 12
        # has colors
        has_colors = src[pos]
        pos += 1
        if has_colors:
            pos += num_verts * 4  # RGBA bytes per vert
        # numTxCoordMaps
        num_tx_maps = struct.unpack_from("<I", src, pos)[0]
        pos += 4
        for i in range(num_tx_maps):
            if i == 1:
                pos += 8 * num_verts  # null padding for second UV map
            pos += num_verts * 8  # 2 floats per vert
        # skin
        has_skin = src[pos]
        pos += 1
        if has_skin:
            pos += num_verts * 16  # 4 floats weights per vert
            pos += num_verts * 4   # 4 uchars bone indices per vert
        # collision data
        num_collisions = struct.unpack_from("<i", src, pos)[0]
        pos += 4
        for _ in range(num_collisions):
            col_type = struct.unpack_from("<I", src, pos)[0]
            pos += 4
            pos += 64  # transform matrix
            if col_type == 0:  # sphere
                pos += 4
            elif col_type == 1:  # box
                pos += 12
            elif col_type == 2:  # capsule
                pos += 8
            elif col_type == 3:  # convex mesh
                num_polys = struct.unpack_from("<i", src, pos)[0]
                pos += 4
                pos += num_polys * (12 + 4 + 2 + 2)  # normal + d + numIndices + indexStart
                num_mesh_indices = struct.unpack_from("<i", src, pos)[0]
                pos += 4
                pos += num_mesh_indices * 2
                num_mesh_verts = struct.unpack_from("<i", src, pos)[0]
                pos += 4
                pos += num_mesh_verts * 12
        # bounds (min + max, 2x vec3)
        pos += 24

    # Everything from pos onwards is animation + animation mask
    animation_data = src[pos:]

    # Now write the cubebody
    out = bytearray()

    # Header
    out += header

    # Bones (unchanged)
    out += bytes([num_bones])
    out += bones_data

    # Helpers (unchanged)
    out += bytes([num_helpers])
    out += helpers_data

    # Has mesh = 1
    out += bytes([1])

    # Mesh header — use "cubebody" as name, same id/parent/matrices
    mesh_name = b"cubebody" + b"\x00" * (KHM_MAX_OBJECT_NAME - len(b"cubebody"))
    mesh_id = num_bones + num_helpers  # same convention as exporter
    out += mesh_name
    out += struct.pack("<i", mesh_id)
    out += struct.pack("<i", -1)  # parent
    out += b"\x00" * 64  # matLocal (identity-ish, doesn't matter for cubebody)
    out += b"\x00" * 64  # matGlobal

    # Geometry: 3 verts, 3 indices (1 triangle)
    # Tiny triangle at origin
    verts = [
        (0.0, 0.0, 0.0),
        (0.001, 0.0, 0.0),
        (0.0, 0.001, 0.0),
    ]
    indices = [0, 1, 2]
    face_normal = (0.0, 0.0, 1.0)

    # numVertices
    out += struct.pack("<I", 3)
    # vertices (swizzled: x, z, y — matching WriteSwizzledVector3)
    for v in verts:
        out += struct.pack("<fff", v[0], v[2], v[1])
    # normals
    for _ in range(3):
        out += struct.pack("<fff", 0.0, 1.0, 0.0)
    # numIndices
    out += struct.pack("<I", 3)
    # indices
    for idx in indices:
        out += struct.pack("<H", idx)
    # face normals (1 face)
    out += struct.pack("<fff", face_normal[0], face_normal[2], face_normal[1])
    # has colors = 0
    out += bytes([0])
    # numTxCoordMaps = 1
    out += struct.pack("<I", 1)
    # UV coords for 3 verts
    for _ in range(3):
        out += struct.pack("<ff", 0.0, 0.0)

    # Skin: has skin = 1, weighted to bone 1 (Bip001 Pelvis)
    out += bytes([1])
    # weights: [1.0, 0.0, 0.0, 0.0] for each vert
    for _ in range(3):
        out += struct.pack("<ffff", 1.0, 0.0, 0.0, 0.0)
    # bone indices: [1, 0, 0, 0] for each vert (4 uchars)
    for _ in range(3):
        out += struct.pack("<BBBB", 1, 0, 0, 0)

    # Collision data: 0 collisions
    out += struct.pack("<i", 0)

    # Bounds: min and max
    out += struct.pack("<fff", 0.0, 0.0, 0.0)
    out += struct.pack("<fff", 0.001, 0.001, 0.0)

    # Animation + animation mask (preserved from original)
    out += animation_data

    with open(output_path, "wb") as f:
        f.write(out)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    dolls_dir = os.path.join(repo_root, "mod", "models", "dolls")
    output_dir = os.path.join(dolls_dir, "cubebodies")

    os.makedirs(output_dir, exist_ok=True)

    count = 0
    for filename in sorted(os.listdir(dolls_dir)):
        if not filename.endswith(".khm"):
            continue
        if filename.startswith("_"):
            continue

        input_path = os.path.join(dolls_dir, filename)
        output_path = os.path.join(output_dir, filename)

        try:
            make_cubebody(input_path, output_path)
            print(f"  {filename} -> cubebodies/{filename}")
            count += 1
        except Exception as e:
            print(f"  {filename} FAILED: {e}", file=sys.stderr)

    print(f"\nGenerated {count} cubebodies in {output_dir}")


if __name__ == "__main__":
    main()
