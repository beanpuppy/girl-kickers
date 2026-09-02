import hashlib
import math
import os
import struct

import bpy
import mathutils
from mathutils import Vector

from .binary_io import *
from .khm_objects import *

KHM_VERSION = 101
KHM_MAX_OBJECT_NAME = 48
KHM_MAX_BONE_INFLUENCES = 4
KHM_MAX_BONES = 64


def IterActionFCurves(animation_data):
    # Blender 4.4 moved f-curves out of Action into per-slot channelbags and
    # 5.0 dropped Action.fcurves entirely, so walk the layered action instead.
    action = animation_data.action if animation_data else None
    if action is None:
        return

    if hasattr(action, "fcurves"):  # legacy actions, Blender < 5.0
        yield from action.fcurves
        return

    slot = animation_data.action_slot
    if slot is None:
        return

    for layer in action.layers:
        for strip in layer.strips:
            if strip.type != "KEYFRAME":
                continue
            channelbag = strip.channelbag(slot)
            if channelbag:
                yield from channelbag.fcurves


def ReadSkin(file, pMesh):
    print("ReadSkin", file.tell())
    hasSkin = ReadUChar(file)
    print("hasSkin", hasSkin)
    if hasSkin == 0:
        print("No Skin")
        return  # no skin

    n = pMesh.numVertices
    # Read all skin weights in bulk (4 floats per vertex)
    buf = file.read(n * 16)
    pMesh.pSkinWeights = [
        Vector(struct.unpack_from("4f", buf, i * 16)) for i in range(n)
    ]
    # Read all bone indices in bulk (4 bytes per vertex)
    buf = file.read(n * 4)
    pMesh.pSkinBoneIndices = [
        list(struct.unpack_from("4B", buf, i * 4)) for i in range(n)
    ]


def ReadCollisionData(file, pMesh):
    print("ReadCollisionData", file.tell())
    pMesh.numCollisions = ReadInt(file)
    if pMesh.numCollisions == 0:
        print("no Collisions")

    pMesh.pCollisions = []
    for c in range(pMesh.numCollisions):
        pMesh.pCollisions.append(sCollisionShape())
        col = pMesh.pCollisions[c]
        col.collisionType = ReadUInt(file)
        col.transform = ReadMatrix(file)
        if col.collisionType == 0:  # "SPHERE"
            col.setSphere(ReadFloat(file))
        elif col.collisionType == 1:  # "BOX"
            x = ReadFloat(file)
            y = ReadFloat(file)
            z = ReadFloat(file)
            col.setBox([x, -z, y])
            print("Read the box matrix as", col.transform)
        elif col.collisionType == 2:  # "CAPSULE"
            col.setCapsule(ReadFloat(file), ReadFloat(file))
        elif col.collisionType == 3:  # CONVEX_MESH"
            col.setConvexMesh()
            col.bShared = True

            col.mesh.numPolys = ReadInt(file)
            col.mesh.pPolygons = []
            for p in range(col.mesh.numPolys):
                col.mesh.pPolygons.append(sCollisionPolygon(file))

            col.mesh.numIndices = ReadInt(file)
            col.mesh.pIndices = []
            for p in range(col.mesh.numIndices):
                col.mesh.pIndices.append(ReadUShort(file))

            col.mesh.numVertices = ReadInt(file)
            col.mesh.pVertices = []
            for p in range(col.mesh.numVertices):
                col.mesh.pVertices.append(ReadVector3(file))
        else:
            print(
                "[Error] CLoader::ReadCollisionData(file, pMesh) - unknown collision type"
            )


def ReadGeometry(file, pMesh):
    print("ReadGeometry", file.tell())
    # read verts
    pMesh.numVertices = ReadInt(file)
    n = pMesh.numVertices

    # Read all vertices in bulk (3 floats per vertex, swizzle x,-z,y)
    buf = file.read(n * 12)
    pMesh.pVertices = [
        Vector(
            (
                struct.unpack_from("f", buf, i * 12)[0],
                -struct.unpack_from("f", buf, i * 12 + 8)[0],
                struct.unpack_from("f", buf, i * 12 + 4)[0],
            )
        )
        for i in range(n)
    ]

    # Read all normals in bulk (same swizzle)
    buf = file.read(n * 12)
    pMesh.pNormals = [
        Vector(
            (
                struct.unpack_from("f", buf, i * 12)[0],
                -struct.unpack_from("f", buf, i * 12 + 8)[0],
                struct.unpack_from("f", buf, i * 12 + 4)[0],
            )
        )
        for i in range(n)
    ]

    # read triangle indices in bulk
    pMesh.numIndices = ReadInt(file)
    buf = file.read(pMesh.numIndices * 2)
    pMesh.pIndices = list(struct.unpack(f"{pMesh.numIndices}H", buf))

    # read face normals in bulk
    uiNumFaces = pMesh.numIndices // 3
    buf = file.read(uiNumFaces * 12)
    pMesh.pFaceNormals = [
        Vector(
            (
                struct.unpack_from("f", buf, i * 12)[0],
                -struct.unpack_from("f", buf, i * 12 + 8)[0],
                struct.unpack_from("f", buf, i * 12 + 4)[0],
            )
        )
        for i in range(uiNumFaces)
    ]

    # read vtx colors
    hasVertColors = ReadUChar(file)
    if hasVertColors == 1:
        buf = file.read(n * 4)
        pMesh.pColors = [
            [b / 255.0 for b in struct.unpack_from("4B", buf, i * 4)] for i in range(n)
        ]

    # read tx coords
    pMesh.numTxCoordMaps = ReadUInt(file)
    pMesh.pTexCoords = []
    for i in range(pMesh.numTxCoordMaps):
        if i == 1:
            file.read(8 * n)
        buf = file.read(n * 8)
        for j in range(n):
            u = struct.unpack_from("f", buf, j * 8)[0]
            v = 1 - struct.unpack_from("f", buf, j * 8 + 4)[0]
            pMesh.pTexCoords.append((u, v))

    # read skin
    ReadSkin(file, pMesh)

    # read collision data
    ReadCollisionData(file, pMesh)

    print("ReadBounds", file.tell())

    # read bounds
    pMesh.min = ReadVector3(file)
    pMesh.max = ReadVector3(file)

    # compute volume at load time (TODO: this is exporter's job)
    pMesh.volume = 0.0
    for i in range(pMesh.numCollisions):
        col = pMesh.pCollisions[i]
        if col.collisionType == 3 or col.collisionType == 4:  # CONVEX_MESH or MESH
            s = pMesh.max - pMesh.min
            pMesh.volume += s[0] * s[1] * s[2]
        else:
            pMesh.volume += col.GetVolume()


def ReadMeshes(file, pModelDefinition):
    print("ReadMeshes", file.tell())
    count = ReadUChar(file)
    if count == 0:
        print("No mesh")
        return

    pModelDefinition.pMesh = sObjectMesh()
    pObject = pModelDefinition.pMesh
    pObject.szName = ReadObjectName(file)
    pObject.uiId = ReadInt(file)
    pObject.uiParentId = ReadInt(file)
    pObject.matLocal = ReadMatrix(file)
    pObject.matGlobal = ReadMatrix(file)
    # This fails assertion sometimes. Fix this
    # assert pObject.uiId < 256
    if pObject.uiId >= 256:
        pObject.uiId = 255
    if pObject.uiParentId > 256 and pObject.uiParentId < 4294967295:
        # assert False;
        pObject.uiParentId = 255

    ReadGeometry(file, pModelDefinition.pMesh)


def ReadBones(file, pModelDefinition):
    print("ReadBones", file.tell())
    count = ReadUChar(file)
    if count == 0:
        print("No Bones")
        return
    pModelDefinition.numBones = count
    pModelDefinition.lBones = []
    for i in range(pModelDefinition.numBones):
        bone = sObjectBase()
        bone.szName = ReadObjectName(file)
        bone.uiId = ReadInt(file)
        bone.uiParentId = ReadInt(file)
        bone.matLocal = ReadMatrix(file)
        bone.matGlobal = ReadMatrix(file)
        pModelDefinition.lBones.append(bone)


def ReadHelpers(file, pModelDefinition):
    print("ReadHelpers", file.tell())
    count = ReadUChar(file)
    if count == 0:
        print("No Helpers")
        return
    pModelDefinition.numHelpers = count
    pModelDefinition.lHelpers = []
    for i in range(pModelDefinition.numHelpers):
        helper = sObjectBase()
        helper.szName = ReadObjectName(file)
        helper.uiId = ReadInt(file)
        helper.uiParentId = ReadInt(file)
        helper.matLocal = ReadMatrix(file)
        helper.matGlobal = ReadMatrix(file)
        pModelDefinition.lHelpers.append(helper)


def ReadAnimation(file, pModelDefinition):
    print("ReadAnimation", file.tell())
    count = ReadUChar(file)
    if count == 0:
        print("No Animation")
        return
    pModelDefinition.pAnimation = sAnimation()
    pAnimation = pModelDefinition.pAnimation
    pAnimation.numNodes = ReadInt(file)
    pAnimation.startTimeS = ReadFloat(file)
    pAnimation.endTimeS = ReadFloat(file)
    pAnimation.numNodeFrames = ReadInt(file)
    assert pAnimation.startTimeS == 0.0
    if pAnimation.startTimeS != 0.0:
        print(
            "[Error] Found non-zero StartTime when loading animation %s. Please export entire animation."
        )
        return
    pAnimation.frameDurationMs = (
        pAnimation.endTimeS * 1000.0 / max(pAnimation.numNodeFrames - 1, 1)
    )

    for node in range(pAnimation.numNodes):
        pNodeAnimation = sNodeAnimation()
        pNodeAnimation.uiNodeId = ReadUInt(file)
        pNodeAnimation.szNodeName = ReadObjectName(file)
        pAnimation.pNodeAnimations.append(pNodeAnimation)

    for node in range(pAnimation.numNodes):
        for frame in range(pAnimation.numNodeFrames):
            pNodeTransform = sNodeTransform()
            pNodeTransform.qRot = ReadQuaternion(file)
            pNodeTransform.vTrans = ReadSwizzledVector3(file)
            pNodeTransform.vScale = ReadVector3(file)
            # if frame == 0:
            pAnimation.pNodeTransforms.append(pNodeTransform)


def ReadAnimationMask(file, pModelDefinition):
    print("ReadAnimationMask", file.tell())
    count = ReadUChar(file)
    if count == 0:
        print("No Animation Mask")
        return
    pAnimationMask = sAnimationMask()
    pAnimationMask.numNodes = ReadUInt(file)
    for i in range(pAnimationMask.numNodes):
        pAnimationMaskEntry = sAnimationMaskEntry()
        pAnimationMaskEntry.szNodeName = ReadObjectName(file)
        pAnimationMaskEntry.mask = ReadInt(file)
        pAnimationMask.sAnimationMaskEntry.append(pAnimationMaskEntry)
    pModelDefinition.pAnimationMask = pAnimationMask


def LoadModel(pszFilePath):
    if os.path.exists(pszFilePath) == False:
        return None  # could not open file

    file = open(pszFilePath, mode="rb")

    content = file.read()
    file.seek(0)

    fileHeader = sHeader(file)

    if (
        fileHeader.uiSig[0:1] != b"K"
        or fileHeader.uiSig[1:2] != b"H"
        or fileHeader.uiSig[2:3] != b"M"
    ):
        print(
            "[Error] CLoader::LoadModel({0}) - KHM header mismatch.".format(pszFilePath)
        )
        return None  # different kind of file

    if fileHeader.uiVer != KHM_VERSION:
        print(
            "[Error] CLoader::LoadModel({0}) - wrong file version {1}, expected {2}".format(
                pszFilePath, fileHeader.uiVer, KHM_VERSION
            )
        )
        return None  # version mismatch!

    pModelDefinition = sModelDefinition()
    pModelDefinition.membuff = file
    pModelDefinition.sModelName = hashlib.md5(content)

    #
    # read bones
    ReadBones(file, pModelDefinition)

    #
    # read helpers
    ReadHelpers(file, pModelDefinition)

    #
    # read meshes
    ReadMeshes(file, pModelDefinition)

    #
    # read animation
    ReadAnimation(file, pModelDefinition)

    #
    # read animation mask
    ReadAnimationMask(file, pModelDefinition)
    print("pAnimationMask == None", pModelDefinition.numBones == None)

    print("Num bones:", pModelDefinition.numBones)
    print("Num helpers:", pModelDefinition.numHelpers)

    print("EOF Position:", file.tell())
    print("Actual file size:", len(content))

    return pModelDefinition


def SetPoseBoneSelected(pose_bone, selected):
    # Blender 5.x stores selection on PoseBone, older versions on Bone
    if hasattr(pose_bone, "select"):
        pose_bone.select = selected
    else:
        pose_bone.bone.select = selected


def SpawnAnimationMask(context, pModelDefinition):
    print("SpawnAnimationMask")

    if (
        len(bpy.context.selected_objects) != 1
        or bpy.context.selected_objects[0].type != "ARMATURE"
    ):
        print(
            "[Error] SpawnAnimationMask: Please select an armature to load the animation mask."
        )
        return

    b_obj = context.object

    bpy.ops.object.mode_set(mode="POSE")
    bones_to_highlight = set()

    for bone in pModelDefinition.pAnimationMask.sAnimationMaskEntry:
        if bone.mask == 1:
            bones_to_highlight.add(bone.szNodeName)

    for pose_bone in b_obj.pose.bones:
        # helpers are imported as bones with a "HELPER_" prefix, mask files use the bare name
        node_name = pose_bone.name
        if node_name.startswith("HELPER_"):
            node_name = node_name[7:]
        SetPoseBoneSelected(pose_bone, node_name in bones_to_highlight)


def SpawnAnimation(context, pModelDefinition):
    if (
        len(bpy.context.selected_objects) != 1
        or bpy.context.selected_objects[0].type != "ARMATURE"
    ):
        print(
            "[Error] SpawnAnimation: Please select an armature to load the animation."
        )
        return

    b_obj = context.object

    # Build mapping from animation node names to armature bones
    anim_nodes = pModelDefinition.pAnimation.pNodeAnimations
    armature_bone_names = [b.name for b in b_obj.data.bones]

    # Map animation node index -> armature bone name
    node_to_bone = {}
    for n, node_anim in enumerate(anim_nodes):
        anim_bone_name = node_anim.szNodeName
        if anim_bone_name in armature_bone_names:
            node_to_bone[n] = anim_bone_name

    # Get local matrices for matched bones
    local_matrixes = {}
    bpy.ops.object.mode_set(mode="EDIT")

    for n, bone_name in node_to_bone.items():
        edit_bone = b_obj.data.edit_bones[bone_name]
        if edit_bone.parent != None:
            local_matrix = edit_bone.parent.matrix.inverted() @ edit_bone.matrix
        else:
            local_matrix = edit_bone.matrix
        local_matrixes[n] = local_matrix

    bpy.ops.object.mode_set(mode="POSE")

    # Ensure armature has an action for keyframes
    if b_obj.animation_data is None:
        b_obj.animation_data_create()
    if b_obj.animation_data.action is None:
        b_obj.animation_data.action = bpy.data.actions.new(name="KHM_Animation")

    num_frames = pModelDefinition.pAnimation.numNodeFrames
    num_nodes = pModelDefinition.pAnimation.numNodes

    for f in range(num_frames):
        for n in range(num_nodes):
            if n not in node_to_bone:
                continue

            bone_name = node_to_bone[n]
            node_transform_counter = (num_frames * n) + f

            loc = pModelDefinition.pAnimation.pNodeTransforms[
                node_transform_counter
            ].vTrans
            rot = pModelDefinition.pAnimation.pNodeTransforms[
                node_transform_counter
            ].qRot
            sca = pModelDefinition.pAnimation.pNodeTransforms[
                node_transform_counter
            ].vScale

            loc -= local_matrixes[n].to_translation()

            matrix = mathutils.Matrix.LocRotScale(loc, rot, sca)

            matrix = (matrix.transposed() @ local_matrixes[n]).transposed()

            b_obj.pose.bones[bone_name].matrix_basis = matrix

        bpy.context.view_layer.update()

        for n, bone_name in node_to_bone.items():
            b_obj.pose.bones[bone_name].keyframe_insert(data_path="location", frame=f)
            b_obj.pose.bones[bone_name].keyframe_insert(
                data_path="rotation_quaternion", frame=f
            )
            b_obj.pose.bones[bone_name].keyframe_insert(data_path="scale", frame=f)

    context.scene.frame_end = num_frames
    fps = 1000 / pModelDefinition.pAnimation.frameDurationMs
    context.scene.render.fps = int(fps)

    # Remove redundant keyframes where values don't change between frames
    for fcurve in IterActionFCurves(b_obj.animation_data):
        keyframes = fcurve.keyframe_points
        if len(keyframes) < 3:
            continue
        to_remove = []
        for i in range(1, len(keyframes) - 1):
            prev_val = keyframes[i - 1].co[1]
            curr_val = keyframes[i].co[1]
            next_val = keyframes[i + 1].co[1]
            if abs(curr_val - prev_val) < 0.0001 and abs(curr_val - next_val) < 0.0001:
                to_remove.append(i)
        for i in reversed(to_remove):
            keyframes.remove(keyframes[i])


def SpawnModel(context, pModelDefinition):
    id_to_obj = {}
    id_to_children_id = {}
    spawned_extra_objects = []

    if pModelDefinition.lBones != None:
        amt = bpy.data.armatures.new("Armature")
        from bpy_extras import object_utils

        amt_ob = object_utils.object_data_add(context, amt)
        amt_ob.location = (0.0, 0.0, 0.0)

        bpy.ops.object.mode_set(mode="EDIT")

        for bone in pModelDefinition.lBones:  # spawn the bones
            bone_obj = amt.edit_bones.new(bone.szName)
            bone_obj.head = Vector((0, 0, 0))
            bone_obj.tail = Vector((0.001, 0, 0))
            # bone_obj.matrix = bone.matGlobal
            id_to_obj[bone.uiId] = bone_obj
            if bone.uiParentId != -1:
                if bone.uiParentId not in id_to_children_id:
                    id_to_children_id[bone.uiParentId] = [bone.uiId]
                else:
                    id_to_children_id[bone.uiParentId].append(bone.uiId)

    if pModelDefinition.lHelpers != None:
        for helper in pModelDefinition.lHelpers:  # spawn the helpers
            assert helper.uiId not in id_to_obj

            bone_is_parent = False
            if helper.uiParentId != -1 and helper.uiParentId in id_to_obj:
                if type(id_to_obj[helper.uiParentId]) is bpy.types.EditBone:
                    bone_is_parent = True

            if bone_is_parent == True:
                helper_obj = amt.edit_bones.new("HELPER_" + helper.szName)
                helper_obj.head = Vector((0, 0, 0))
                helper_obj.tail = Vector((0.001, 0, 0))
                helper_obj.parent = id_to_obj[helper.uiParentId]
                helper_obj.matrix = helper.matGlobal
            else:
                helper_obj = bpy.data.objects.new("HELPER_" + helper.szName, None)
                context.view_layer.active_layer_collection.collection.objects.link(
                    helper_obj
                )
                helper_obj.matrix_world = helper.matGlobal
                spawned_extra_objects.append(helper_obj)
            id_to_obj[helper.uiId] = helper_obj

    if pModelDefinition.pMesh != None:
        print("Spawning mesh", pModelDefinition.pMesh.szName)
        pMesh = pModelDefinition.pMesh
        b_mesh = bpy.data.meshes.new(pModelDefinition.pMesh.szName)
        b_obj = bpy.data.objects.new(pModelDefinition.pMesh.szName, b_mesh)

        assert pModelDefinition.pMesh.uiId not in id_to_obj
        id_to_obj[pModelDefinition.pMesh.uiId] = b_obj

        # Build face list from indices using slicing (much faster than per-element loop)
        indices = pMesh.pIndices
        list_faces = [
            (indices[i], indices[i + 1], indices[i + 2])
            for i in range(0, pMesh.numIndices, 3)
        ]

        b_mesh.from_pydata(pMesh.pVertices, [], list_faces)

        b_mesh.update()

        if pMesh.pColors is not None:
            b_mesh.vertex_colors.new()

        uvlayer = b_obj.data.uv_layers.new()

        # Build flat UV array and use foreach_set (orders of magnitude faster)
        uv_flat = []
        for i in range(pMesh.numIndices):
            uv = pMesh.pTexCoords[indices[i]]
            uv_flat.append(uv[0])
            uv_flat.append(uv[1])
        uvlayer.data.foreach_set("uv", uv_flat)

        if pMesh.pColors is not None:
            color_flat = []
            for i in range(pMesh.numIndices):
                c = pMesh.pColors[indices[i]]
                color_flat.append(c[0])
                color_flat.append(c[1])
                color_flat.append(c[2])
                color_flat.append(c[3] if len(c) > 3 else 1.0)
            b_obj.data.vertex_colors[0].data.foreach_set("color", color_flat)
        # Build combined list of all skinnable objects (bones + helpers) indexed by their ID
        skin_targets = {}  # id -> name mapping

        if pModelDefinition.lBones != None:
            for bone in pModelDefinition.lBones:
                b_obj.vertex_groups.new(name=bone.szName)
                skin_targets[bone.uiId] = bone.szName

        # Helpers can also be skin targets - create vertex groups for them too
        if pModelDefinition.lHelpers != None:
            for helper in pModelDefinition.lHelpers:
                # Helpers in the armature have HELPER_ prefix, but skin data uses the raw name
                vg_name = "HELPER_" + helper.szName
                b_obj.vertex_groups.new(name=vg_name)
                skin_targets[helper.uiId] = vg_name

        if pMesh.pSkinBoneIndices is not None:
            # First pass: find all bone IDs referenced in skin data and batch weights per group
            # group_weights maps bone_idx -> list of (vertex_index, weight)
            group_weights = {}
            for i in range(len(pMesh.pSkinBoneIndices)):
                for v in range(4):
                    bone_idx = pMesh.pSkinBoneIndices[i][v]
                    weight = pMesh.pSkinWeights[i][v]
                    if weight < 0.0001:
                        continue
                    if bone_idx not in skin_targets:
                        vg_name = f"Bone_{bone_idx}"
                        b_obj.vertex_groups.new(name=vg_name)
                        skin_targets[bone_idx] = vg_name
                        print(
                            f"[Warning] Created placeholder vertex group '{vg_name}' for unknown bone ID {bone_idx}"
                        )
                    if bone_idx not in group_weights:
                        group_weights[bone_idx] = []
                    group_weights[bone_idx].append((i, weight))

            # Second pass: assign weights in batches per vertex group
            for bone_idx, vert_weights in group_weights.items():
                vg_name = skin_targets.get(bone_idx)
                if vg_name is None:
                    continue
                vertex_group = b_obj.vertex_groups.get(vg_name)
                if vertex_group is None:
                    continue
                for vert_idx, weight in vert_weights:
                    vertex_group.add([vert_idx], weight, "ADD")

        b_mesh.update(calc_edges=True)
        context.view_layer.active_layer_collection.collection.objects.link(b_obj)

        bpy.context.view_layer.objects.active = b_obj
        # bpy.ops.object.mode_set(mode='EDIT')
        # bpy.ops.mesh.select_all(action='SELECT')
        # bpy.ops.mesh.remove_doubles(threshold = 0.001)
        # bpy.ops.mesh.select_all(action='DESELECT')
        # bpy.ops.object.mode_set(mode='OBJECT')

        for collision in pModelDefinition.pMesh.pCollisions:
            print(
                "Spawning collision",
                sCollisionShape.eCollisionType[collision.collisionType],
            )

            if collision.collisionType == 0:  # Sphere
                bpy.ops.mesh.primitive_uv_sphere_add()
                col_obj = bpy.context.active_object
                col_obj.name = "COL_SPHERE"
                col_obj.matrix_world = collision.transform
                col_obj.scale = (
                    collision.sphere.radius,
                    collision.sphere.radius,
                    collision.sphere.radius,
                )

            elif collision.collisionType == 1:  # Box
                bpy.ops.mesh.primitive_cube_add()

                col_obj = bpy.context.active_object
                bpy.ops.object.mode_set(mode="EDIT")

                # col_obj.data.vertices[0].co = [0.0, 0.0, 0.0]

                col_obj.name = "COL_BOX"
                col_obj.matrix_world = collision.transform
                col_obj.scale = collision.box.extents

            elif collision.collisionType == 2:  # Capsule
                bpy.ops.mesh.primitive_cylinder_add()
                col_obj = bpy.context.active_object
                col_obj.name = "COL_CAPSULE"
                col_obj.matrix_world = collision.transform
                # Since we spawn a cylinder rather than a capsule, adjust for the extra height with 0.2488
                col_obj.scale = (
                    collision.capsule.radius,
                    collision.capsule.radius,
                    collision.capsule.halfHeight + 0.2488,
                )
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.select_all(action="SELECT")
                bpy.ops.transform.rotate(value=math.radians(90.0), orient_axis="Y")

            elif collision.collisionType == 3:  # Convex mesh
                bpy.ops.object.empty_add(type="PLAIN_AXES")
                col_obj = bpy.context.active_object
                col_obj.name = "CONVEX_MESH"
                print("[ERROR] Unimplimented collision type: Convex Mesh!")

            spawned_extra_objects.append(col_obj)

            # delete all the faces
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.delete(type="ONLY_FACE")
            bpy.ops.mesh.select_all(action="DESELECT")
            bpy.ops.object.mode_set(mode="OBJECT")

        for obj in bpy.context.selected_objects:
            obj.select_set(False)

        # Merge duplicate vertices (but skip on large meshes to avoid crashes)
        bpy.context.view_layer.objects.active = b_obj
        b_obj.select_set(True)
        if pMesh.numVertices < 10000:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.remove_doubles(threshold=0.001)
            bpy.ops.mesh.select_all(action="DESELECT")
            bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.mode_set(mode="OBJECT")

    if pModelDefinition.lBones != None:
        # Bone parenting must happen in edit mode where EditBone refs are valid
        bpy.ops.object.select_all(action="DESELECT")
        amt_ob.select_set(True)
        bpy.context.view_layer.objects.active = amt_ob
        bpy.ops.object.mode_set(mode="EDIT")

        for bone in pModelDefinition.lBones:  # parent the bones
            if bone.uiParentId != -1:
                assert bone.uiParentId in id_to_obj
                id_to_obj[bone.uiId].parent = id_to_obj[bone.uiParentId]

        for bone in pModelDefinition.lBones:
            id_to_obj[bone.uiId].matrix = bone.matGlobal

        bpy.ops.object.mode_set(mode="OBJECT")

        # for bone in pModelDefinition.lBones:
        #     if bone.uiParentId != -1:
        #        if bone.uiId in id_to_children_id: #parent tail = average of childrens heads
        #            average_pos = Vector((0, 0, 0))
        #            for child in id_to_children_id[bone.uiId]:
        #                average_pos += id_to_obj[child].head
        #            average_pos /= len(id_to_children_id[bone.uiId])
        #            id_to_obj[bone.uiId].tail = average_pos

        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")
        b_obj.select_set(True)
        bpy.context.view_layer.objects.active = amt_ob
        bpy.ops.object.parent_set(type="ARMATURE")
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")

        amt_ob.select_set(state=True)
        context.view_layer.objects.active = amt_ob

    if pModelDefinition.pMesh != None:
        if pModelDefinition.pMesh.uiParentId != -1:
            assert pModelDefinition.pMesh.uiParentId in id_to_obj
            parent_candidate = id_to_obj[pModelDefinition.pMesh.uiParentId]
            mesh_obj = id_to_obj[pModelDefinition.pMesh.uiId]
            if isinstance(parent_candidate, bpy.types.EditBone):
                # EditBones can't be Object parents; parent to armature with bone target
                mesh_obj.parent = amt_ob
                mesh_obj.parent_type = "BONE"
                mesh_obj.parent_bone = parent_candidate.name
            else:
                mesh_obj.parent = parent_candidate

        for obj in spawned_extra_objects:
            obj.parent = id_to_obj[pModelDefinition.pMesh.uiId]


def load(
    operator,
    context,
    filepath="",
    use_manual_orientation=False,
    global_matrix=None,
):
    pModelDefinition = LoadModel(filepath)
    # file = open("H:\\DK2\\importjson.json", "w+")
    # file.write(json.dumps(pModelDefinition.toJSON(), sort_keys=True, indent=4))
    # file.close()

    if pModelDefinition.pMesh != None:
        SpawnModel(context, pModelDefinition)
    elif pModelDefinition.pAnimation != None:
        # Animation-only file - need existing armature selected
        if context.object == None or context.object.type != "ARMATURE":
            raise Exception(
                "This is an animation-only file. "
                "Please import a model with matching skeleton first, "
                "select the armature, then import this animation."
            )

    if context.object != None:
        if pModelDefinition.pAnimation != None:
            SpawnAnimation(context, pModelDefinition)

        if pModelDefinition.pAnimationMask != None:
            SpawnAnimationMask(context, pModelDefinition)

    return {"FINISHED"}
