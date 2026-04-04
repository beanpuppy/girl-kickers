// Hardcoded XML fragments extracted from the base game's doctrine.xml.
// These are identical for all units and never need customisation.

export const SCREEN_CHROME = `<GUIItems>

<Item name="Doctrine_Screen" sizeX="1290" sizeY="1380" hidden="true">
\t<OnOpen>
\t\t<Action type="PlaySound" target="gui_customize_equip"/>
\t\t<Action type="AddChild" target="Deploy_Screen"/>
\t\t<Action type="TriggerEvent" target="GUI_CAPTURE_INPUT"/>
\t\t<Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_OPENED"/>
\t\t<Action type="AddChild" target="Menu_Main_Blurred_Background"/>
\t\t<Action type="MoveToBackground" target="Menu_Main_Blurred_Background"/>
\t</OnOpen>
\t<OnClose>
\t\t<Action type="TriggerEvent" target="GUI_RELEASE_INPUT"/>
\t\t<Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_CLOSED"/>
\t\t<Action type="RemoveChild" target="Deploy_Screen"/>
\t</OnClose>
\t<OnKeyDown key0="27" key1="32">
\t\t<Action type="Click" target="Doctrine_Screen_Back"/>
\t</OnKeyDown>
\t<Item origin="0 0" sizeX="9999" sizeY="9999" blurBackground="true" blurColor="a0a0a0">
\t</Item>
\t<Item origin="0 0" sizeX="9999" sizeY="9999">
\t\t<OnCursorDown>
\t\t\t<Action type="Click" target="Doctrine_Screen_Back"/>
\t\t</OnCursorDown>
\t\t<OnRClickDown>
\t\t\t<Action type="Click" target="Doctrine_Screen_Back"/>
\t\t</OnRClickDown>
\t</Item>
\t<StaticImage name="#available_doctrinepoints_ttip" origin="170 30" align="rt" tooltip="change by game">
\t\t<RenderObject2D texture="data/textures/gui/doctrines/customization_doctrine.dds"/>
\t\t<StaticText align="t" name="#available_doctrinepoints" origin="0 -120" text="32" font="header_3" textColor="f97b03"/>
\t</StaticImage>
\t<StaticImage stealFocus="true">
\t\t<RenderObject2D texture="data/textures/gui/menu_darkbrown_background.tga" sizeX="1290" sizeY="1444" color="ffffffc8"/>
\t\t<StaticText text="@menu_m_doctrine" origin="24 674" align="l" font="header_2" textColor="f97b03"/>
\t</StaticImage>
\t<Item name="#DoctrineTree_Parent" align="i">
\t</Item>
\t<Button name="#Doctrine_Reset" align="rb" origin="-20 20">
\t\t<ButtonText text="@menu_doctrine_reset" origin="-4 0" align="r" font="header_2" textColor="f0e3cc"/>
\t\t<OnHover>
\t\t\t<ButtonText text="@menu_doctrine_reset" align="r" origin="-4 0" font="header_2" textColor="211e1d"/>
\t\t\t<RenderObject2D texture="data/textures/gui/button_hover_01.tga" align="l" color="f0e3cc" flipX="true"/>
\t\t</OnHover>
\t\t<OnClick>
\t\t\t<Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_RESET"/>
\t\t</OnClick>
\t</Button>
\t<Button name="Doctrine_Screen_Back" align="lb" origin="20 20">
\t\t<ButtonText text="@menu_generic_back" align="l" font="header_2" textColor="f0e3cc"/>
\t\t<OnHover>
\t\t\t<ButtonText text="@menu_generic_back" align="l" font="header_2" textColor="211e1d"/>
\t\t\t<RenderObject2D texture="data/textures/gui/button_hover_01.tga" align="l" color="f0e3cc"/>
\t\t</OnHover>
\t\t<OnClick>
\t\t\t<Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_BACK"/>
\t\t</OnClick>
\t</Button>
</Item>`;

export const BUTTON_TEMPLATE = `\t<Button name="#template_doctrine_button" hidden="true">
\t\t<RenderObject2D texture="data/textures/gui/doctrines/doctrine_empty_normal.dds"/>
\t\t<OnHover>
\t\t\t<RenderObject2D texture="data/textures/gui/doctrines/doctrine_empty_hover.dds"/>
\t\t</OnHover>
\t\t<OnClick>
\t\t\t<Action type="PlaySound" target="gui_customize_equip"/>
\t\t\t<Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_SELECT"/>
\t\t</OnClick>
\t\t<OnRClickDown>
\t\t\t<Action type="PlaySound" target="gui_customize_equip"/>
\t\t\t<Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_REMOVE"/>
\t\t</OnRClickDown>
\t\t<StaticImage name="#doctrinenode_disabled">
\t\t\t<RenderObject2D texture="data/textures/gui/doctrines/doctrine_empty_normal.dds" color="928a7c"/>
\t\t</StaticImage>
\t\t<StaticImage name="#doctrinenode_full">
\t\t\t<RenderObject2D texture="data/textures/gui/doctrines/doctrine_empty_hover.dds"/>
\t\t</StaticImage>
\t\t<StaticImage name="#doctrinenode_active">
\t\t\t<RenderObject2D texture="data/textures/gui/doctrines/doctrine_active.dds" sizeX="124" sizeY="124"/>
\t\t</StaticImage>
\t\t<Item name="#doctrinenode_does_not_pass_requirements" hidden="true"/>
\t\t<StaticImage name="#doctrinenode_num_levels_bg" align="lb" origin="0 0">
\t\t\t<RenderObject2D texture="data/textures/gui/square.tga" sizeX="44" sizeY="36" color="40392be6"/>
\t\t\t<StaticText name="#doctrinenode_num_levels" text="4" font="header_5" textColor="ffffff">
\t\t\t\t<StaticText hidden="true" name="#doctrinenode_num_levels_color_full" textColor="f97b03"/>
\t\t\t\t<StaticText hidden="true" name="#doctrinenode_num_levels_color_part" textColor="ffffff"/>
\t\t\t</StaticText>
\t\t</StaticImage>
\t</Button>`;

export const TOOLTIP = `<Item name="Doctrine_Node_Tooltip" sizeX="600" sizeY="250" origin="0 0" hidden="true">
\t<OnOpen>
\t\t<Action type="SetForeground" target="this"/>
\t</OnOpen>
\t<Item name="#doctrine_ttip_size_min" hidden="true" sizeX="600" sizeY="200"/>
\t<Item name="#doctrine_ttip_section_main" origin="0 0" align="lt" blurBackground="true" blurColor="404040" sizeX="600" sizeY="200">
\t\t<StaticText name="#doctrine_ttip_name" origin="15 -8" align="lt" font="header_4" textColor="f97b03" text="DOCTRINE NAME">
\t\t\t<StaticImage name="#doctrine_ttip_section_bar" origin="0 -44" align="lt">
\t\t\t\t<RenderObject2D texture="data/textures/gui/square.tga" sizeX="570" sizeY="4" color="f97b03"/>
\t\t\t</StaticImage>
\t\t</StaticText>
\t\t<StaticText name="#doctrine_ttip_descr" origin="15 -60" align="lt" wordWrap="true" font="paragraph_2" textColor="f0e3cc" text="Description goes here"/>
\t</Item>
\t<Item name="#doctrine_ttip_section_required" origin="0 -54" align="lb" blurBackground="true" blurColor="404040" sizeX="600" sizeY="50">
\t\t<StaticImage align="l" origin="15 0">
\t\t\t<RenderObject2D texture="data/textures/gui/locked_icon.dds" color="f93703ff" scaleX="0.28" scaleY="0.28"/>
\t\t</StaticImage>
\t\t<StaticText name="#doctrine_ttip_section_required_text" align="r" origin="-15 0" font="header_4" textColor="f93703" text="@menu_doctrine_required_level"/>
\t</Item>
</Item>`;
