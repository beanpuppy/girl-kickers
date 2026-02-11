# Converting MMD Models to KHM in 3ds Max

This guide walks through the complete process of converting MMD (MikuMikuDance) models to KHM format for use in Door Kickers 2, including re-texturing and re-rigging.

> [!NOTE]
> This guide is more specific to Girls' Frontline 2 MMD models.

## Overview

MMD models are designed for animation software and need to be adapted to work in Door Kickers 2. This process involves:

1. **Importing and scaling** - MMD models need to be scaled to DK2's 1.9m character height
2. **Removing the MMD skeleton** - The original bone structure isn't compatible with DK2
3. **Optimising geometry** - Reducing polygon count for game performance (target: under 44,000 faces)
4. **Consolidating textures** - Merging multiple MMD textures into a single texture map for DK2
5. **Re-rigging with DK2 skeleton** - Adding DK2's bone structure and fitting it to the model
6. **Painting skin weights** - Ensuring the model deforms correctly with the new skeleton
7. **Exporting** - Converting to KHM format for use in-game

The entire process typically takes 10-20 minutes per model once you're familiar with the workflow.

## Prerequisites

### Software

- 3ds Max 2026 (not tested on older versions, but will probably still work)
- GIMP (or equivalent image editor)

### 3ds Max Knowledge

This guide assumes you have basic familiarity with 3ds Max. Before starting, you should understand:

- **Camera navigation** - How to pan, zoom, and rotate the viewport
- **Object manipulation** - How to move, rotate, and scale objects
- **Selection** - How to select objects in the viewport and scene hierarchy
- **Basic UI navigation** - Finding panels, menus, and modifiers

> [!TIP]
> If you're new to 3ds Max, search for beginner tutorials on YouTube covering "3ds Max viewport navigation" and "3ds Max basic object manipulation" before proceeding.

## Setup

### Install Required Plugins

1. Install the 3ds Max KHM exporter plugin from `\Steam\steamapps\common\DoorKickers2\tools\3dsmax_khm_exporter` (instructions included)
2. Download and install the PMX importer from: https://www.moddb.com/downloads/3ds-max-2010-pmx-importer1

### Download MMD Models

You can get GFL2 MMD models from either:
- https://gf2exilium.sunborngame.com/main/art (models from Global only)
- https://www.aplaybox.com/u/636064186/model (all CN models, requires phone number to sign up)

## Part 1: Configure 3ds Max and Import Model

### Configure Units

First, make sure your units are set to metres. Open **Customize > Units Setup...** and configure as shown:

![units](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/units.png)

Run the PMX importer script - **Scripting > Run Script...** then open `PmxToolv1_2`. You should see a window popup with two buttons **Import** and **Export** and a section below that called **Import Options**.

Click on **Import Options** to unfold the section. We're now going to edit the scale of the import - it's probably set to something like 3.937 by default, which is WAY too big.

> [!IMPORTANT]
> DK2 expects all models to be a height of 1.9m. Unfortunately, there is no way to determine what scale value will get us to 1.9m, so we need to do trial and error. I suggest starting at a scale of 0.1.

Enter 0.1 and press the **Import** button.

Then go to the folder you extracted the model into and select the `.pmx` file, for me that will be `GirlsFrontline QiongJiuDefault.pmx`.

> [!TIP]
> It can take a few minutes to import, so be patient - 3ds Max will appear frozen, but that's normal.

Once the model is in the viewport, we need to check its height. Make sure the model is selected in the list on the left (the model is usually called `Object001`) and then press the **wrench** icon on the top bar in the panel on the right. And under **Utilities**, click **Measure**. This will open a new section with **Dimensions** where you can see the X, Y, Z values of the model. We want the **Z** value to be as close to 1.9m as possible (I've found anything from 1.88 to 1.92 to be acceptable).

![measure](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/measure.png)

This shows a Z dimension of 2.01m which will not work, we need to re-import it with a different scale. Since we need to make it only slightly smaller, I'm going to try a scale of 0.095 this time, which is -0.005 from 0.1.

![measure2](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/measure2.png)

Nice! That will work.

### Remove Existing Bones

Now we're going to remove all the existing bones from the model (all the pyramid shapes you see everywhere). First, go back to the left side panel, find the **Select** menu at the top, click it and toggle **Select Children** on. This means we will now select all the children of whatever top-level parent is selected.

Then you can just **Ctrl-click** on everything that isn't the model (again, the model is usually called `Object001`) and then right click in the panel and click **Delete**.

> [!TIP]
> This will also probably freeze 3ds Max for a while.

Now you should have a clean viewport with just the model, that looks something like this:

![viewport](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/viewport.png)

### Remove Material Shininess

You'll notice the model is very shiny - 3ds Max adds a shiny/reflective material to the model by default. To remove this, we need to remove the reflections from all materials using a script.

Open the script listener with **F11** (or **Scripting > Scripting Listener**), delete everything that's already in there, and paste in the following script:

```3ds
for mat in sceneMaterials where classof mat == Multimaterial do for sub in mat.materialList where sub != undefined and classof sub == PhysicalMaterial do (sub.base_weight = 1.0; sub.reflectivity = 0.0; sub.roughness = 1.0; sub.metalness = 0.0)
```

Click at the end of the script line (after the final `)`) and press **Enter** to execute it. Your model should no longer be shiny.

## Part 2: Optimise and Prepare Textures

### Optimise Vertex Count

Now we need to optimise the model to reduce its vertex count. With the model selected (if you still have **Select Children** toggled, turn that off now), open the **Modify** panel and in the **Modifier List** search for **ProOptimizer** and click it. In the list underneath that dropdown, drag **ProOptimizer** to be below **Skin**, then select it - a few sections should appear below.

First we want to toggle **Keep Textures** under **Materials and UVs**, then we press the **Calculate** button at the top. The right side panel should then look something like this:

![optimise](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/optimise.png)

> [!IMPORTANT]
> The important number we need to look at is **Faces** - mine says "39989 / 39989". This is already perfect! We want to keep it under 44000 (ideally 40000).

But even though we have an acceptable vertex/face count, I still like to run it through the optimiser anyway, but I'll only be optimising it a little. So if you want to do that, or need to optimise it because it has too many faces - enter a new percentage into the **Vertex %** field and click **Calculate** again.

I'm only going to enter "99" but if you need to actually reduce the vertex count, you should go somewhere between 90% and 80%.

After entering 99 into the input box and pressing **Enter**, the faces count now says "39989 / 39740" where 39740 is the new amount once we apply it. I'm happy with that so let's right click on the **ProOptimizer** modifier back at the top list and then click **Collapse To** to apply it.

> [!NOTE]
> There will be a warning message, but it's fine - just press "Yes".

Now is a good time to save the model as a checkpoint so we can revert back to it if we need to. But before doing that, I suggest renaming the model from `Object001` to something more descriptive - I'm going to rename mine to `qbz191`. After that, just save it with **Ctrl-S** and name the `.max` file however you want.

### Merge Textures into Single Map

Nice! Now we're going to merge all the textures that the model uses into one big texture that can then be used in DK2.

Make sure the model is selected and in the **Modify** panel, search for **Unwrap UVW** and click it. Then click on the triangle next to **Unwrap UVW** and select **Polygon**, then enter **Ctrl-A** to select all polygons. Your viewport should look like this:

![uvwselect](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/uvwselect.png)

Then in the **Channel** section, change **Map Channel** from "1" to "2" and hit **Enter**.

> [!NOTE]
> Press **OK** on any warnings that appear.

In the **Edit UVs** section above it, click **Open UV Editor...**. This will open a new window.

Now at the top bar of that window click **Mapping > Flatten Mapping...**. This will open another window, here you just change the **Spacing** value from "0.001" to "0", then click **OK**.

> [!TIP]
> This will also take a while.

Once that's done your **Edit UVWs** window should look like this, with the UVs flattened:

![edituvws](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/edituvws.png)

Now close that window, go back to the right panel and in the **Channel** section, click **Save** - I'm going to save mine as `qbz191.uvw`.

We're now going to render the texture into a `.dds`, but we first need to make sure our rendering settings are correct. Go to **Rendering > Render Setup...** and change your settings to this:

![rendersettings](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/rendersettings.png)

The important thing is that we're using **Scanline Renderer**, you should also probably click **Save as Default** so you don't have to do this every time. 

With that done we also need to create a temporary light in the scene so that the texture is evenly lit when rendering it. On the right side panel, click the **Create** tab (the plus symbol) and search in the search box for **Skylight**. Place that anywhere in the scene, its position does not matter.

Now we're ready to render it. With the model selected, go to **Rendering > Render To Texture...** to open the **Render To Texture** window. Scroll down to the **Mapping Coordinates** section and change the channel to "2". Scroll down to the **Output** section and click **Add...**. Double click on **DiffuseMap**.

In the section under that you should see **File Name and Type** be something like `qbz191DiffuseMap.tga`, click the three dots button next to that and change **Save as type** to **DDS Image File (*.dds)** and click **Save**. Another window will appear, you can just press **OK** for that to leave it as the default. Now find the **Width** and **Height** fields and change them to be both "4096". In the end it should look like this:

![rendertexturesettings](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/rendertexturesettings.png)

Now you can click **Render**. This will render it and save it as `qbz191DiffuseMap.dds` or whatever you named it in the path we saw previously.

Once that's done, you can close the rendering windows and then delete the skylight we made. Select the model again and delete the **Unwrap UVW** modifier by right clicking it and clicking **Delete**.

In the modifier list, find and create an **Edit Poly** modifier and drag this to be under **Skin** but above **Editable Mesh** in the list. Click on the modifier and in the **Selection** section, click the polygon option (the blue square), use **Ctrl-A** to select all polygons. Then find the **Polygon: Material IDs** section (it should be near the end), and enter "1" into the **Set ID** field and press **Enter**. When you do that, the **Select ID** field should then also become "1".

![editpoly](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/editpoly.png)

Now right click on the **Edit Poly** modifier and click **Collapse To**, again ignoring the warning and pressing **Yes**.

Then create another **Unwrap UVW** modifier, and under the **Channel** section click **Load...** and open the `.uvw` file you saved earlier.

> [!TIP]
> Now we need to add the textures back (well, we don't *need* to, but I think it's easier to work with if we have them). Press **M** on your keyboard to open the **Material Editor** window. Scroll down until you get to the **Generic Maps** section and click on the **No Map** button for **Base Color**. Search for **Bitmap** and then select the `qbz191DiffuseMap.dds` file you rendered earlier. Make sure your model is selected and click **Material > Assign to Selection** in the menu.

Your model should now have the textures applied. It will be shiny again and the textures look a little weird, but that's fine since it won't be seen in-game (this is just the defaults 3ds Max applies).

## Part 3: Re-rig with New Bones

### Import Bones

Now we're ready to re-rig the model with new bones. You can use the `dk2_characters_rig_ver2019.max` reference file in the DK2 tools folder to do this, but that will require editing the pose of that armature since our models use different poses.

Instead I suggest using the scene file I provide in this repo at `/tools/3ds_scenes/springfield_bones.max`. This has the bones already in the correct pose, so all you need to do is edit the size of them to match your model.

To do this, open **File > Import > Merge...** in the top menu bar, open the scene file, and select everything except `gfl_springfield`.

![bonesselect](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/bonesselect.png)

Now your viewport should look like this:

![bonesstart](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/bonesstart.png)

First, move the `@Collision.capsule` object to become a child of `qbz191`:

![collisionchild](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/collisionchild.png)

Now you should work on scaling the bones to match your model as close as possible. To make it easier, I suggest setting your **Selection Filter** to **Bone** so you can only select bones.

![selectionfilter](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/selectionfilter.png)

For these bones, I need to scale the spine and hands to be shorter in order to match the model.

> [!WARNING]
> I generally will NOT touch the legs, as DK2 appears to want the pelvis bone in a specific place or else everything gets messed up. Adjusting the legs will change the position of the pelvis, which we can't do. This means the model's hip joints are never where they're supposed to be - we can't do anything about this.
>
> You also shouldn't shortern or lengthen the arms and hands too much, but it isn't as big a deal.

After shortening the spine and hands, my model now looks like this:

![bonesedited](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/bonesedited.png)

### Apply Skin Weights

Now we want to select the `qbz191` object, go to the **Modify** tab and select the **Skin** modifier. This will mess up the textures - don't worry about it. In **Parameters** click **Bones: Add**, which will open a new window where you should just see `Bip001` in the list. In the menu bar of that window click **Select > Select All** and click the **Select** button at the bottom. This will add all the bones to the list.

Still in the **Skin** modifier, go to **Weight Properties**, find **Weight Solver** and make sure the dropdown is set to **Voxel**. Then click the three dots button next to it, and in the window that opens, click **Apply**. Once that runs, you can close the window.

To check the weights have been applied, scroll back to the top of the **Parameters** section and click **Edit Envelopes** and then click on any bone in the list (I like to use `Bip001 Head`). Once that's clicked, you should see the head of the model shaded in red/orange/blue.

![checkweights](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/checkweights.png)

### Weight Hair (and Accessories) to Specific Bones (Optional)

For characters with hair that reaches their neck or longer, we also want to set the weights of the hair to the head bone so the hair doesn't become messed up in-game.

> [!TIP]
> This same technique applies to other static accessories that extend from the body - like capes, bags, or equipment. Weight these to an appropriate bone that doesn't move much, like `Bip001 Spine` (avoid bones like arms that move a lot). For example, Nemesis's cape and Lewis's bag have been weighted to `Bip001 Spine` instead of letting the automatic weights control them. 

Select the vertices checkbox in **Select** and then select **Select Element**.

![selectelement](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/selectelement.png)

Now **Ctrl-Click** on all the hair of the model to select them. Make sure you ONLY select the hair (the head itself is also probably fine to select).

![selecthair](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/selecthair.png)

Then go back down to the **Weight Properties** and click the weight tool (the wrench icon next to **Weight Table**). You should see a window like this:

![weightnohead](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/weightnohead.png)

But we have a problem here - there's no `Bip001 Head` in the list!

> [!CAUTION]
> This means that the hair vertices do not have enough weights assigned to the head bone to be put in this list. So instead, we need to first select the hair elements that are close to the head, and gradually add other hair elements to them.

![selecthair2](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/selecthair2.png)

Here we can see I've selected only a portion of the hair, including ones right on the head, and now we have `Bip001 Head` in the list. What we want to do now is set the weights to be 100% for the head bone. Click on the `Bip001 Head` bone in the list and then click on the **1** button. Now it should be set to "1.000", and the hair elements that we selected should be completely red.

![selecthair3](https://github.com/beanpuppy/girl-kickers/blob/main/docs/media/model_conversion/selecthair3.png)

Now continue **Ctrl-Clicking** on hair elements and setting the weights to be 100% for the head bone. This will gradually build up the weights for the head bone, allowing the hair to be properly controlled by the head bone.

> [!NOTE]
> If you select a new hair element, but the `Bip001 Head` still says "1.000", you should still click **1** - make sure all the hair elements are completely red.

Once you're done with that, you're finally ready to export it!

## Part 4: Export

### Export KHM File

Make sure nothing is selected in the left panel, then click **File > Export** and export it as a `.khm` file. You should save it to `girl-kickers\mod\models\dolls`. 

### Export Texture File

You also need to save the texture file to that path. Open the `qbz191DiffuseMap.dds` file (it's usually saved to `\Documents\3ds Max 2026\sceneassets\images`) in GIMP.

> [!IMPORTANT]
> Do **not** select **Flip image vertically** when opening in GIMP, then export it to the same path as the `.khm` file (select **yes** to **Flip image vertically on export**).

## Testing

That's it! You're ready to work on adding the character to the game. If you want to test it first, just replace an existing character's model in the mod and look at it in-game.
