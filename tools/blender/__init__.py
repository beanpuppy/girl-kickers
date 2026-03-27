# Changelog:
# v2.0 - Fixed export producing incorrect bone weights
#      - Fixed import crash on models with helper weights
#      - Fixed crashes on large meshes (40k+ verts)
import bpy
from bpy.props import BoolProperty, StringProperty
from bpy_extras.io_utils import (
    ExportHelper,
    ImportHelper,
)

bl_info = {
    "name": "KHM Tools",
    "author": "Reuben Yu (original), Antistratégie (fixes)",
    "version": (2, 0),
    "blender": (5, 1, 0),
    "location": "File > Import/Export > khm (.khm)",
    "description": "Import and export Door Kickers 2 model files",
    "warning": "",
    "wiki_url": "",
    "category": "Import-Export",
}


class ImportKhm(bpy.types.Operator, ImportHelper):
    "Load a khm file"

    bl_idname = "khm.import"
    bl_label = "Import khm"

    filename_ext = ".khm"
    filter_glob: StringProperty(
        default="*.khm",
        options={"HIDDEN"},
    )

    def draw(self, context):
        pass

    def execute(self, context):
        if not self.filepath:
            raise Exception("filepath not set")

        from . import import_khm

        return import_khm.load(self, context, self.filepath)


class ExportKhm(bpy.types.Operator, ExportHelper):
    """Export to a khm file"""

    bl_idname = "export_scene.khm"
    bl_label = "Export KHM"
    bl_options = {"PRESET"}

    filename_ext = ".khm"
    filter_glob: StringProperty(default="*.khm", options={"HIDDEN"})

    export_mesh: BoolProperty(
        name="Mesh",
        description="Export the mesh to the khm",
        default=True,
    )

    export_animation: BoolProperty(
        name="Animation",
        description="Export the animation to the khm",
        default=False,
    )

    export_animation_mask: BoolProperty(
        name="Animation Mask",
        description="Export the animation mask to the khm",
        default=False,
    )

    def draw(self, context):
        pass

    def execute(self, context):
        if context.active_object is not None:
            if context.active_object.mode == "EDIT":
                bpy.ops.object.mode_set(mode="OBJECT")

        keywords = self.as_keywords(
            ignore=(
                "check_existing",
                "filter_glob",
                "ui_tab",
            )
        )

        from . import export_khm

        return export_khm.save(context, **keywords)


class KHM_PT_export_include(bpy.types.Panel):
    bl_space_type = "FILE_BROWSER"
    bl_region_type = "TOOL_PROPS"
    bl_label = "Export"
    bl_parent_id = "FILE_PT_operator"

    @classmethod
    def poll(cls, context):
        sfile = context.space_data
        operator = sfile.active_operator

        return operator.bl_idname == "EXPORT_SCENE_OT_khm"

    def draw(self, context):
        layout = self.layout
        layout.use_property_split = True
        layout.use_property_decorate = False  # No animation.

        sfile = context.space_data
        operator = sfile.active_operator

        layout.prop(operator, "export_mesh")
        layout.prop(operator, "export_animation")
        layout.prop(operator, "export_animation_mask")


def menu_func_import(self, context):
    self.layout.operator(ImportKhm.bl_idname, text="khm (.khm)")


def menu_func_export(self, context):
    self.layout.operator(ExportKhm.bl_idname, text="khm (.khm)")


def register():
    bpy.utils.register_class(ImportKhm)
    bpy.utils.register_class(ExportKhm)
    bpy.utils.register_class(KHM_PT_export_include)
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)
    bpy.types.TOPBAR_MT_file_export.append(menu_func_export)


def unregister():
    bpy.utils.unregister_class(ImportKhm)
    bpy.utils.unregister_class(ExportKhm)
    bpy.utils.unregister_class(KHM_PT_export_include)
    bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    bpy.types.TOPBAR_MT_file_export.remove(menu_func_export)


if __name__ == "__main__":
    register()
