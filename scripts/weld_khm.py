#!/usr/bin/env python3
"""
Weld coincident vertices in KHM meshes, via Blender.

Why this exists
---------------
KHM stores one UV, one normal and one set of skin weights per vertex, so a
vertex sitting on a UV seam has to be written out twice at the same position.
That duplication is required by the format and is not a defect.

It becomes a defect when the duplicates disagree about how they deform. Two
vertices stacked at the same position but bound to different bones sit together
in the rest pose and pull apart the moment the skeleton moves, which reads
in game as a seam splitting open. Model decimation (3ds Max ProOptimizer, for
instance) is a common way to end up in that state, but the extraction pipeline
produces it too.

The fix cannot be applied to the KHM directly. Welding there would mean merging
vertices that carry different UVs, which discards one of them and tears the
texture along every seam. Blender stores UVs per face corner rather than per
vertex, so it can weld the geometry while leaving the seams intact. The KHM
exporter then re-splits vertices per unique position/UV/normal/weight
combination on the way out, which restores the duplicates the format needs,
this time agreeing on normals and weights.

Usage
-----
    uv run python scripts/weld_khm.py mod/models/dolls/
    uv run python scripts/weld_khm.py mod/models/dolls/sopmodii.khm
    uv run python scripts/weld_khm.py mod/models/dolls/ --threshold 0.0005
    uv run python scripts/weld_khm.py mod/models/dolls/ --dry-run

Files are rewritten in place. They are tracked in git, so `git checkout` is the
undo. Use --out-dir to write elsewhere instead.

The script relaunches itself inside Blender when run from a normal Python
interpreter, so there is no Blender command line to remember. The khm_tools
add-on must be enabled in Blender (see tools/blender/).
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

DEFAULT_THRESHOLD = 0.0001  # 0.1mm


def in_blender():
    try:
        import bpy  # noqa: F401

        return True
    except ImportError:
        return False


def collect(target: Path):
    if target.is_dir():
        return sorted(target.glob("*.khm"))
    return [target]


def relaunch(args):
    """Re-run this script inside headless Blender."""
    blender = os.environ.get("BLENDER", "blender")
    cmd = [
        blender,
        "--background",
        "--python",
        str(Path(__file__).resolve()),
        "--",
        str(args.target),
        str(args.threshold),
        str(args.out_dir or ""),
        "1" if args.dry_run else "0",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        sys.exit(
            f"Could not run '{blender}'. Install Blender or set BLENDER=/path/to/blender"
        )
    # Blender is noisy, so only surface our own lines plus anything that failed.
    for line in proc.stdout.splitlines():
        if line.startswith(("[", "TOTAL", "WELD", "SKIP", "FAIL")):
            print(line)
    if proc.returncode != 0:
        print(proc.stderr[-2000:], file=sys.stderr)
        sys.exit(proc.returncode)


def count_disagreements(obj, threshold):
    """Vertices stacked within `threshold` that disagree on skin weights.

    This is the defect the weld repairs. Stacked vertices bound to different
    bones sit together at rest and separate once the mesh animates. A file
    reporting 0 here is already sound; the raw merge count is not a useful
    signal on its own, because the KHM round trip always re-splits vertices
    at UV seams whether or not anything was wrong.
    """
    from collections import defaultdict

    cell = max(threshold, 1e-9)
    buckets = defaultdict(list)
    for vert in obj.data.vertices:
        key = (
            round(vert.co.x / cell),
            round(vert.co.y / cell),
            round(vert.co.z / cell),
        )
        buckets[key].append(vert)

    bad = 0
    for group in buckets.values():
        if len(group) < 2:
            continue
        signatures = set()
        for vert in group:
            signatures.add(
                tuple(sorted((g.group, round(g.weight, 3)) for g in vert.groups))
            )
            if len(signatures) > 1:
                bad += 1
                break
    return bad


def run_in_blender():
    import bmesh
    import bpy

    argv = sys.argv[sys.argv.index("--") + 1 :]
    target = Path(argv[0])
    threshold = float(argv[1])
    out_dir = Path(argv[2]) if argv[2] else None
    dry_run = argv[3] == "1"

    if not hasattr(bpy.ops.khm, "import"):
        sys.exit("khm_tools add-on is not enabled in Blender (see tools/blender/)")

    files = collect(target)
    if not files:
        sys.exit(f"no .khm files found at {target}")
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    merged_total = 0
    torn_total = 0
    failed = 0
    for n, src in enumerate(files, 1):
        dst = (out_dir / src.name) if out_dir else src
        try:
            for obj in list(bpy.data.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
                for datablock in list(block):
                    block.remove(datablock)

            getattr(bpy.ops.khm, "import")(filepath=str(src))
            meshes = [o for o in bpy.data.objects if o.type == "MESH"]
            if not meshes:
                print(f"[{n}/{len(files)}] SKIP {src.name}: no mesh")
                continue
            obj = max(meshes, key=lambda o: len(o.data.vertices))

            verts_before = len(obj.data.vertices)
            polys_before = len(obj.data.polygons)
            disagreeing = count_disagreements(obj, threshold)

            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=threshold)
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()

            verts_after = len(obj.data.vertices)
            polys_after = len(obj.data.polygons)
            merged = verts_before - verts_after
            merged_total += merged
            torn_total += disagreeing
            lost = polys_before - polys_after
            pct = (lost / polys_before * 100) if polys_before else 0.0

            flag = "  <-- check, heavy triangle loss" if pct > 1.0 else ""
            state = "clean" if disagreeing == 0 else f"{disagreeing} torn"
            print(
                f"[{n}/{len(files)}] {src.name}: {state}, merged {merged} verts, "
                f"tris {polys_before}->{polys_after} (-{lost}, {pct:.2f}%){flag}"
            )

            if dry_run:
                continue

            # The exporter reads selected_objects[0] and needs object mode.
            if bpy.context.object and bpy.context.object.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
            for o in bpy.data.objects:
                o.select_set(False)
            armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
            export_target = armatures[0] if armatures else obj
            export_target.select_set(True)
            bpy.context.view_layer.objects.active = export_target
            bpy.ops.export_scene.khm(filepath=str(dst))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"[{n}/{len(files)}] FAIL {src.name}: {exc}")

    mode = "dry run, nothing written" if dry_run else "written"
    print(
        f"TOTAL {len(files)} file(s), {torn_total} torn vertex groups repaired, "
        f"{merged_total} vertices merged, {mode}"
    )
    if failed:
        print(f"FAIL {failed} file(s) errored")


def main():
    parser = argparse.ArgumentParser(
        description="Weld coincident vertices in KHM meshes via Blender.",
        epilog="Fixes stacked vertices that disagree on skin weights or normals, "
        "which tear open when the mesh animates. UVs are preserved.",
    )
    parser.add_argument("target", type=Path, help="a .khm file or a directory of them")
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"merge distance in metres (default {DEFAULT_THRESHOLD}, i.e. 0.1mm)",
    )
    parser.add_argument(
        "--out-dir", type=Path, help="write here instead of rewriting in place"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="report what would merge, write nothing"
    )
    args = parser.parse_args()
    if not args.target.exists():
        sys.exit(f"not found: {args.target}")
    relaunch(args)


if __name__ == "__main__":
    if in_blender():
        run_in_blender()
    else:
        main()
