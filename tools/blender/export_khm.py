import copy

import bpy
import mathutils

from .binary_io import *
from .khm_objects import *

KHM_VERSION = 101
KHM_MAX_OBJECT_NAME = 48
KHM_MAX_BONE_INFLUENCES = 4
KHM_MAX_BONES = 64


def SerializeCollisionData(context, b_obj, pMesh):
    pass


def SerializeSkin(context, b_obj, all_vertexes, pMesh, pModelDefinition):
    if len(b_obj.vertex_groups) == 0:
        pMesh.pSkinWeights = None
        return

    # Build mapping from vertex group name -> bone/helper ID
    vg_name_to_bone_id = {}
    if pModelDefinition.lBones:
        for bone in pModelDefinition.lBones:
            vg_name_to_bone_id[bone.szName] = bone.uiId
    if pModelDefinition.lHelpers:
        for helper in pModelDefinition.lHelpers:
            # Helpers in Blender have "HELPER_" prefix
            vg_name_to_bone_id["HELPER_" + helper.szName] = helper.uiId

    pMesh.pSkinWeights = []
    pMesh.pSkinBoneIndices = []
    warned_groups = set()

    for vertex in all_vertexes:
        indices = []
        weights = []
        # vertex[3] is now a tuple of (group_index, weight) pairs
        for group_idx, weight in vertex[3]:
            # Get vertex group name from index, then map to bone ID
            vg_name = b_obj.vertex_groups[group_idx].name
            bone_id = vg_name_to_bone_id.get(vg_name)
            if bone_id is None:
                if vg_name not in warned_groups:
                    print(f"[Warning] Vertex group '{vg_name}' does not match any bone/helper - weights will be lost")
                    warned_groups.add(vg_name)
                bone_id = 0
            indices.append(bone_id)
            weights.append(weight)
        while len(indices) < KHM_MAX_BONE_INFLUENCES:
            indices.append(0)
        indices = indices[:KHM_MAX_BONE_INFLUENCES]
        while len(weights) < KHM_MAX_BONE_INFLUENCES:
            weights.append(0)
        weights = weights[:KHM_MAX_BONE_INFLUENCES]
        pMesh.pSkinBoneIndices.append(indices)
        pMesh.pSkinWeights.append(weights)


def VertexAlias(point1, point2):
    return (point2 - point1).length < 0.05


def SerializeGeometry(context, b_obj, pMesh, pModelDefinition):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = b_obj

    # Triangulate using modifier (avoids edit mode crash on large meshes)
    tri_mod = b_obj.modifiers.new(name="Triangulate_Export", type="TRIANGULATE")
    depsgraph = context.evaluated_depsgraph_get()
    b_obj_eval = b_obj.evaluated_get(depsgraph)

    # Use evaluated mesh for export
    b_obj_data_backup = b_obj.data
    b_obj.data = bpy.data.meshes.new_from_object(b_obj_eval)
    b_obj.modifiers.remove(tri_mod)

    pMesh.pVertices = []
    pMesh.pNormals = []
    pMesh.pIndices = []
    pMesh.pFaceNormals = []
    if len(b_obj.data.vertex_colors) != 0:
        pMesh.pColors = []
    vertex_to_uv = {}
    vertex_to_nrm = {}

    all_vertexes = []

    pMesh.numTxCoordMaps = 1  # todo multiple uv layers
    pMesh.pTexCoords = []

    # Use dict for O(1) vertex deduplication instead of O(n) list lookups
    vertex_to_index = {}

    for face in b_obj.data.polygons:
        pMesh.pFaceNormals.append(tuple(face.normal))
        for vert_idx, loop_idx in zip(face.vertices, face.loop_indices):
            vert = b_obj.data.vertices[vert_idx]
            uv = b_obj.data.uv_layers.active.data[loop_idx].uv
            # Convert groups to a simple tuple for comparison
            groups = tuple((g.group, g.weight) for g in vert.groups)

            if len(b_obj.data.vertex_colors) != 0:
                color = b_obj.data.vertex_colors[0].data[loop_idx].color
                tup = (
                    tuple(vert.co),
                    tuple(uv),
                    tuple(vert.normal),
                    groups,
                    color[0],
                    color[1],
                    color[2],
                    color[3],
                )
            else:
                tup = (tuple(vert.co), tuple(uv), tuple(vert.normal), groups)

            if tup not in vertex_to_index:
                vertex_to_index[tup] = len(all_vertexes)
                all_vertexes.append(tup)
            pMesh.pIndices.append(vertex_to_index[tup])

    for vert in all_vertexes:
        pMesh.pVertices.append(vert[0])  # co tuple
        pMesh.pTexCoords.append(vert[1])  # uv tuple
        pMesh.pNormals.append(vert[2])  # normal tuple
        if len(b_obj.data.vertex_colors) != 0:
            pMesh.pColors.append([vert[4], vert[5], vert[6], vert[7]])

    pMesh.numVertices = len(pMesh.pVertices)
    pMesh.numIndices = len(pMesh.pIndices)

    SerializeSkin(context, b_obj, all_vertexes, pMesh, pModelDefinition)
    SerializeCollisionData(context, b_obj, pMesh)

    # Restore original mesh data and clean up triangulated copy
    triangulated_mesh = b_obj.data
    b_obj.data = b_obj_data_backup
    bpy.data.meshes.remove(triangulated_mesh)


def SerializeHelpersAndCollisions(context, b_obj, pModelDefinition):
    # b_obj needs to be the mesh

    pModelDefinition.pMesh.pCollisions = []

    helpers = []

    pMesh = pModelDefinition.pMesh
    pMesh.min = Vector((0, 0, 0))
    pMesh.max = Vector((0, 0, 0))
    pMesh.volume = 0.0

    for ob in bpy.data.objects:
        if ob.parent == b_obj:
            if ob.name.startswith("COL_"):
                print("FOUND COL", ob.name)
                col_type = ob.name[4:]
                collision = sCollisionShape()

                bbox_corners = [
                    ob.matrix_world @ Vector(corner) for corner in ob.bound_box
                ]
                for bbox_corner in bbox_corners:
                    for i in range(3):
                        if bbox_corner[i] < pMesh.min[i]:
                            pMesh.min[i] = bbox_corner[i]
                        if bbox_corner[i] > pMesh.max[i]:
                            pMesh.max[i] = bbox_corner[i]

                if col_type.startswith("SPHERE"):
                    collision.setSphere(ob.scale.x)
                    collision.collisionType = 0
                    loc = ob.matrix_world.to_translation()
                    rot = ob.matrix_world.to_quaternion()
                    sca = Vector((1, 1, 1))
                    collision.transform = mathutils.Matrix.LocRotScale(loc, rot, sca)
                    pModelDefinition.pMesh.pCollisions.append(collision)
                elif col_type.startswith("BOX"):
                    collision.collisionType = 1

                    old_scale = Vector((ob.scale[0], ob.scale[1], ob.scale[2]))
                    ob.scale = Vector((1, 1, 1))

                    bpy.context.view_layer.update()

                    loc = ob.matrix_world.to_translation()
                    rot = ob.matrix_world.to_quaternion()
                    sca = ob.matrix_world.to_scale()
                    collision.transform = mathutils.Matrix.LocRotScale(loc, rot, sca)
                    ob.scale = old_scale
                    pModelDefinition.pMesh.pCollisions.append(collision)
                    # Reverse the import swizzle: import does [x, -z, y], so export does [x, z, -y]
                    collision.setBox([ob.scale[0], ob.scale[2], -ob.scale[1]])

                elif col_type.startswith("CAPSULE"):
                    # Since we spawned a cylinder rather than a capsule, adjust for the extra height with -0.2488
                    collision.setCapsule(ob.scale.x, ob.scale.z - 0.2488)
                    collision.collisionType = 2
                    loc = ob.matrix_world.to_translation()
                    rot = ob.matrix_world.to_quaternion()
                    sca = Vector((1, 1, 1))
                    collision.transform = mathutils.Matrix.LocRotScale(loc, rot, sca)
                    pModelDefinition.pMesh.pCollisions.append(collision)
                elif col_type.startswith("CONVEX_MESH"):
                    print("[ERROR] Unimplimented collision type: Convex Mesh!")

            elif ob.name.startswith("HELPER_"):
                helper = sObjectBase()
                helper.szName = ob.name[7:]
                helper.uiId = len(pModelDefinition.obj_to_id)
                pModelDefinition.obj_to_id[helper.uiId] = ob
                helper.matLocal = ob.matrix_world
                helper.matGlobal = ob.matrix_world
                pModelDefinition.lHelpers.append(helper)
                helpers.append(helper)

    for helper in helpers:
        helper.uiParentId = len(pModelDefinition.obj_to_id)

    pModelDefinition.numHelpers = len(pModelDefinition.lHelpers)
    pModelDefinition.pMesh.numCollisions = len(pModelDefinition.pMesh.pCollisions)

    # swap y and z for max and min bbox
    max_z = pMesh.max[2]
    pMesh.max[2] = pMesh.max[1]
    pMesh.max[1] = max_z
    min_z = pMesh.min[2]
    pMesh.min[2] = pMesh.min[1]
    pMesh.min[1] = min_z
    return


def SerializeBones(context, b_obj, pModelDefinition):
    pModelDefinition.numBones = 0
    pModelDefinition.lBones = []
    if b_obj.type != "ARMATURE":
        return

    bpy.ops.object.mode_set(mode="EDIT")

    pModelDefinition.numBones = len(b_obj.data.edit_bones)

    obj_to_id = pModelDefinition.obj_to_id

    helpers = []
    edit_bones = []

    for bone in b_obj.data.edit_bones:
        if bone.name.startswith("HELPER_"):
            helpers.append(bone)
        else:
            edit_bones.append(bone)

    # First pass: assign IDs to all bones and helpers
    for edit_bone in edit_bones:
        obj_to_id[edit_bone] = len(obj_to_id)
    for helper in helpers:
        obj_to_id[helper] = len(obj_to_id)

    # Second pass: create bone data with parent lookups (now safe)
    for edit_bone in edit_bones:
        bone = sObjectBase()
        bone.szName = edit_bone.name
        bone.uiId = obj_to_id[edit_bone]
        if edit_bone.parent is None:
            bone.uiParentId = -1
        else:
            bone.uiParentId = obj_to_id.get(edit_bone.parent, -1)
        bone.matGlobal = edit_bone.matrix
        if edit_bone.parent is not None:
            bone.matLocal = edit_bone.parent.matrix.inverted() @ edit_bone.matrix
        else:
            bone.matLocal = edit_bone.matrix
        pModelDefinition.lBones.append(bone)

    for helper in helpers:
        bone = sObjectBase()
        bone.szName = helper.name[7:]  # Remove "HELPER_" prefix
        bone.uiId = obj_to_id[helper]  # Already assigned in first pass
        if helper.parent is None:
            bone.uiParentId = -1
        else:
            bone.uiParentId = obj_to_id.get(helper.parent, -1)
        bone.matGlobal = helper.matrix
        if helper.parent is not None:
            bone.matLocal = helper.parent.matrix.inverted() @ helper.matrix
        else:
            bone.matLocal = helper.matrix
        pModelDefinition.lHelpers.append(bone)
        pModelDefinition.numBones -= 1

    bpy.ops.object.mode_set(mode="OBJECT")


def SerializeModel(context, pModelDefinition):
    b_obj = context.object
    pModelDefinition.obj_to_id = {}

    pModelDefinition.pMesh = sObjectMesh()
    pObject = pModelDefinition.pMesh
    pObject.matLocal = b_obj.matrix_local
    pObject.matGlobal = b_obj.matrix_world

    pModelDefinition.lHelpers = []
    SerializeBones(context, b_obj, pModelDefinition)

    if b_obj.type == "ARMATURE":
        attached_meshes = []
        for obj in bpy.data.objects:
            # Skip collision meshes when looking for the main mesh
            if obj.parent == b_obj and obj.type == "MESH" and "COL_" not in obj.name:
                attached_meshes.append(obj)
        if len(attached_meshes) != 1:
            print(
                "[Error] SerializeModel: Armature does not have a singular attached mesh."
            )
            print(f"        Found: {[m.name for m in attached_meshes]}")
            return None
        b_obj = attached_meshes[0]

    SerializeHelpersAndCollisions(context, b_obj, pModelDefinition)
    SerializeGeometry(context, b_obj, pModelDefinition.pMesh, pModelDefinition)

    pObject.szName = b_obj.name
    pObject.uiId = pModelDefinition.numBones + pModelDefinition.numHelpers
    pObject.uiParentId = -1


def SerializeAnimation(context, pModelDefinition):
    b_obj = context.object
    scene = context.scene
    if (
        len(bpy.context.selected_objects) != 1
        or bpy.context.selected_objects[0].type != "ARMATURE"
    ):
        print(
            "[Error] SerializeAnimation: Please select an armature to export the animation."
        )
        return

    pModelDefinition.pAnimation = sAnimation()
    bpy.ops.object.mode_set(mode="POSE")

    pModelDefinition.pAnimation.numNodeFrames = scene.frame_end
    pModelDefinition.pAnimation.frameDurationMs = 1 / scene.render.fps * 1000
    pModelDefinition.pAnimation.numNodes = len(b_obj.pose.bones)
    pModelDefinition.pAnimation.pNodeTransforms = []
    pModelDefinition.pAnimation.pNodeAnimations = []
    pModelDefinition.pAnimation.startTimeS = 0.0
    pModelDefinition.pAnimation.endTimeS = (
        (scene.frame_end - 1) * pModelDefinition.pAnimation.frameDurationMs / 1000
    )

    bones_to_keyframes = {}

    local_matrixes = []
    bpy.ops.object.mode_set(mode="EDIT")
    for n in range(pModelDefinition.pAnimation.numNodes):
        if b_obj.data.edit_bones[n].parent is not None:
            local_matrix = (
                b_obj.data.edit_bones[n].parent.matrix.inverted()
                @ b_obj.data.edit_bones[n].matrix
            )
        else:
            local_matrix = b_obj.data.edit_bones[n].matrix
        local_matrixes.append(local_matrix)

    bpy.ops.object.mode_set(mode="POSE")

    for n in range(len(b_obj.pose.bones)):
        pNodeAnimation = sNodeAnimation()
        pNodeAnimation.uiNodeId = n
        pNodeAnimation.szNodeName = b_obj.pose.bones[n].name
        pModelDefinition.pAnimation.pNodeAnimations.append(pNodeAnimation)

    for f in range(scene.frame_end):
        scene.frame_set(f)

        for n in range(len(b_obj.pose.bones)):
            transform = sNodeTransform()

            pose_bone = b_obj.pose.bones[n]

            matrix = (
                pose_bone.matrix_basis.transposed() @ local_matrixes[n].inverted()
            ).transposed()

            transform.vTrans, transform.qRot, transform.vScale = matrix.decompose()
            transform.vTrans += local_matrixes[n].to_translation()

            if pose_bone.name not in bones_to_keyframes:
                bones_to_keyframes[pose_bone.name] = []
            bones_to_keyframes[pose_bone.name].append(transform)

    for bone in bones_to_keyframes:
        for keyframe in bones_to_keyframes[bone]:
            pModelDefinition.pAnimation.pNodeTransforms.append(keyframe)

    scene.frame_set(1)
    bpy.ops.object.mode_set(mode="OBJECT")


def IsPoseBoneSelected(pose_bone):
    # Blender 5.x stores selection on PoseBone, older versions on Bone
    if hasattr(pose_bone, "select"):
        return pose_bone.select is True
    return pose_bone.bone.select is True


def SerializeAnimationMask(context, pModelDefinition):
    b_obj = context.object
    if (
        len(bpy.context.selected_objects) != 1
        or bpy.context.selected_objects[0].type != "ARMATURE"
    ):
        print(
            "[Error] SerializeAnimationMask: Please select an armature to export the animation mask."
        )
        return

    pModelDefinition.pAnimationMask = sAnimationMask()
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in b_obj.pose.bones:
        animation_mask_entry = sAnimationMaskEntry()
        # helpers are imported as bones with a "HELPER_" prefix, mask files use the bare name
        node_name = pose_bone.name
        if node_name.startswith("HELPER_"):
            node_name = node_name[7:]
        animation_mask_entry.szNodeName = node_name
        if IsPoseBoneSelected(pose_bone):
            animation_mask_entry.mask = 1
        else:
            animation_mask_entry.mask = 0
        pModelDefinition.pAnimationMask.sAnimationMaskEntry.append(animation_mask_entry)
    pModelDefinition.pAnimationMask.numNodes = len(
        pModelDefinition.pAnimationMask.sAnimationMaskEntry
    )


def SaveBones(file, pModelDefinition):
    WriteUChar(file, pModelDefinition.numBones)
    if pModelDefinition.lBones is None:
        return
    for bone in pModelDefinition.lBones:
        WriteObjectName(file, bone.szName)
        WriteInt(file, bone.uiId)
        WriteInt(file, bone.uiParentId)
        WriteMatrix(file, bone.matLocal)
        WriteMatrix(file, bone.matGlobal)


def SaveHelpers(file, pModelDefinition):
    WriteUChar(file, pModelDefinition.numHelpers)
    if pModelDefinition.lHelpers is None:
        return
    for helper in pModelDefinition.lHelpers:
        WriteObjectName(file, helper.szName)
        WriteInt(file, helper.uiId)
        WriteInt(file, helper.uiParentId)
        WriteMatrix(file, helper.matLocal)
        WriteMatrix(file, helper.matGlobal)


def SaveSkin(file, pMesh):
    WriteUChar(file, pMesh.pSkinWeights != None)

    if pMesh.pSkinWeights != None:
        for v in range(pMesh.numVertices):
            WriteVector4(file, pMesh.pSkinWeights[v])
    if pMesh.pSkinBoneIndices != None:
        for v in range(pMesh.numVertices):
            WriteSBoneIndice(file, pMesh.pSkinBoneIndices[v])


def SaveCollisionData(file, pMesh):
    WriteInt(file, pMesh.numCollisions)
    if pMesh.numCollisions == 0:
        return
    for col in pMesh.pCollisions:
        WriteUInt(file, col.collisionType)
        WriteMatrix(file, col.transform)
        if col.collisionType == 0:  # "SPHERE"
            WriteFloat(file, col.sphere.radius)
        elif col.collisionType == 1:  # "BOX"
            WriteFloat(file, col.box.extents[0])
            WriteFloat(file, col.box.extents[1])
            WriteFloat(file, col.box.extents[2])
        elif col.collisionType == 2:  # "CAPSULE"
            WriteFloat(file, col.capsule.radius)
            WriteFloat(file, col.capsule.halfHeight)
        elif col.collisionType == 3:  # "CONVEX MESH"
            WriteInt(file, col.mesh.numPolys)
            for poly in col.mesh.pPolygons:
                WriteVector3(file, poly.normal)
                WriteFloat(file, poly.d)
                WriteShort(file, poly.numIndices)
                WriteShort(file, poly.indexStart)
            WriteInt(file, col.mesh.numIndices)
            for indice in col.mesh.pIndices:
                WriteUShort(file, indice)
            WriteInt(file, col.mesh.numVertices)
            for vert in col.mesh.pVertices:
                WriteVector3(vert)


def SaveGeometry(file, pMesh):
    WriteInt(file, pMesh.numVertices)
    for vertex in pMesh.pVertices:
        WriteSwizzledVector3(file, vertex)
    for normal in pMesh.pNormals:
        WriteSwizzledVector3(file, normal)
    WriteInt(file, pMesh.numIndices)
    for index in pMesh.pIndices:
        WriteUShort(file, index)
    for normal in pMesh.pFaceNormals:
        WriteSwizzledVector3(file, normal)

    WriteUChar(file, pMesh.pColors != None)
    if pMesh.pColors != None:
        for color in pMesh.pColors:
            WriteUChar(file, int(color[0] * 255))
            WriteUChar(file, int(color[1] * 255))
            WriteUChar(file, int(color[2] * 255))
            WriteUChar(file, int(color[3] * 255))

    WriteUInt(file, pMesh.numTxCoordMaps)

    for i in range(pMesh.numTxCoordMaps):
        if i == 1:
            WriteNull(8 * pMesh.numVertices)
        for j in range(pMesh.numVertices):
            WriteFloat(file, pMesh.pTexCoords[j * (i + 1)][0])
            WriteFloat(file, 1 - (pMesh.pTexCoords[j * (i + 1)][1]))

    SaveSkin(file, pMesh)

    print("WriteCollisionData", file.tell())
    SaveCollisionData(file, pMesh)

    print("WriteBounds", file.tell())

    WriteVector3(file, pMesh.min)
    WriteVector3(file, pMesh.max)


def SaveMeshes(file, pModelDefinition):
    WriteUChar(file, pModelDefinition.pMesh != None)
    if pModelDefinition.pMesh == None:
        return
    pObject = pModelDefinition.pMesh
    WriteObjectName(file, pObject.szName)
    WriteInt(file, pObject.uiId)
    WriteInt(file, pObject.uiParentId)
    WriteMatrix(file, pObject.matLocal)
    WriteMatrix(file, pObject.matGlobal)
    SaveGeometry(file, pModelDefinition.pMesh)


def SaveAnimation(file, pModelDefinition):
    pAnimation = pModelDefinition.pAnimation

    WriteUChar(file, pAnimation != None)
    if pAnimation == None:
        return

    WriteInt(file, pAnimation.numNodes)
    WriteFloat(file, pAnimation.startTimeS)
    WriteFloat(file, pAnimation.endTimeS)
    WriteInt(file, pAnimation.numNodeFrames)

    for pNodeAnimation in pAnimation.pNodeAnimations:
        WriteUInt(file, pNodeAnimation.uiNodeId)
        WriteObjectName(file, pNodeAnimation.szNodeName)

    for transform in pAnimation.pNodeTransforms:
        WriteQuaternion(file, transform.qRot)
        WriteSwizzledVector3(file, transform.vTrans)
        WriteVector3(file, transform.vScale)


def SaveAnimationMask(file, pModelDefinition):
    WriteUChar(file, pModelDefinition.pAnimationMask != None)
    if pModelDefinition.pAnimationMask == None:
        return
    WriteUInt(file, pModelDefinition.pAnimationMask.numNodes)
    for animation_mask_entry in pModelDefinition.pAnimationMask.sAnimationMaskEntry:
        WriteObjectName(file, animation_mask_entry.szNodeName)
        WriteInt(file, animation_mask_entry.mask)


def SaveModel(file, pModelDefinition):
    SaveBones(file, pModelDefinition)
    SaveHelpers(file, pModelDefinition)
    SaveMeshes(file, pModelDefinition)
    SaveAnimation(file, pModelDefinition)
    SaveAnimationMask(file, pModelDefinition)


def ExportModel(
    context, filepath, export_mesh, export_animation, export_animation_mask
):
    file = open(filepath, "wb")
    sHeader.export(file)

    if len(bpy.context.selected_objects) == 0:
        print("[Error] ExportModel: No object was selected to export.")
        return {"FINISHED"}

    selected_object = bpy.context.selected_objects[0]

    pModelDefinition = sModelDefinition()

    if export_mesh == True:
        SerializeModel(context, pModelDefinition)
    bpy.context.view_layer.objects.active = selected_object
    if export_animation == True:
        SerializeAnimation(context, pModelDefinition)
    if export_animation_mask == True:
        SerializeAnimationMask(context, pModelDefinition)

    SaveModel(file, pModelDefinition)

    # file2 = open("H:\\DK2\\exportjson.json", "w+")
    # file2.write(json.dumps(pModelDefinition.toJSON(), sort_keys=True, indent=4))
    # file2.close()
    file.close()
    return {"FINISHED"}


def save(
    context,
    *,
    filepath="",
    export_mesh=False,
    export_animation=False,
    export_animation_mask=False,
):
    return ExportModel(
        context, filepath, export_mesh, export_animation, export_animation_mask
    )
