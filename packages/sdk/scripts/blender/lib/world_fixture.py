"""SF55a portable intake fixture: Blender geometry, embedded PNGs and a separate door."""
import os
import sys
import bpy

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
out = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out, exist_ok=True)


def surface(name, colour, textured=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*colour, 1)
    shader.inputs['Roughness'].default_value = 1
    if textured:
        image = bpy.data.images.new(name, width=8, height=8)
        image.pixels = [value for y in range(8) for x in range(8)
                        for value in (*[c * (0.7 if (x + y) % 2 else 1) for c in colour], 1)]
        image.filepath_raw = os.path.join(out, name + '.png')
        image.file_format = 'PNG'
        image.save()
        image.pack()
        texture = material.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image = image
        material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
    return material


def box(name, location, dimensions, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.data.materials.append(material)
    return obj


clay = surface('Clay', (0.6, 0.58, 0.54))
paint = surface('Paint', (0.25, 0.6, 0.5), True)
wood = surface('Door wood', (0.4, 0.22, 0.1), True)
box('ws_terrain_ground', (0, 0, -0.5), (500, 500, 1), clay)
bridge = box('Bridge', (0, -30, 4), (12, 8, 1), paint)
bridge.rotation_euler.z = 0.2
box('Overhang', (16, -30, 7), (12, 8, 1), clay)
box('Support', (16, -30, 3), (2, 2, 6), clay)
box('Door', (10, -15, 1.5), (2, 0.25, 3), wood)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'world.glb'), export_format='GLB',
                          export_yup=True, export_apply=True, export_materials='EXPORT',
                          export_animations=False, export_cameras=False, export_lights=False,
                          export_extras=False, export_image_format='AUTO')
print('[world-fixture] exported ordinary Blender GLB')
