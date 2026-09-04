import { parseProfileJson, parseProfileIni, profileToMaterial, profileToParams, profileToPrinter, powerFactorFromTemp } from '../src/lib/slicer/parseProfile.ts'
import { printerById } from '../src/data/printers.ts'
import { DEFAULT_FDM_PARAMS } from '../src/data/defaults.ts'
const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL:', msg); process.exit(1) } }

// Bambu Studio filament (system profile, arrays of strings)
const fil = parseProfileJson(JSON.stringify({ type: 'filament', name: 'Bambu PETG Basic @BBL X1C', filament_vendor: ['Bambu Lab'], filament_type: ['PETG'], filament_density: ['1.25'], filament_cost: ['24.99'], filament_max_volumetric_speed: ['8'], slow_down_layer_time: ['12'], nozzle_temperature: ['255'], hot_plate_temp: ['70'], inherits: 'fdm_filament_petg' }), 'x.json')
assert(fil.length === 1 && fil[0].kind === 'filament' && fil[0].source === 'bambu' && fil[0].filament!.maxVolumetricSpeed === 8 && fil[0].filament!.density === 1.25 && fil[0].filament!.minLayerTime === 12 && fil[0].notes.includes('inherits'), 'bambu filament')
const m = profileToMaterial(fil[0].filament!, null, 'test')
assert(m.maxFlow === 8 && m.density === 1.25 && m.minLayerTime === 12 && m.powerFactor === 1.9 && m.brand === 'Bambu Lab', 'filament → malzeme')
assert(powerFactorFromTemp(215) === 1 && powerFactorFromTemp(240) === 1.15 && powerFactorFromTemp(280) === 2, 'güç çarpanı')

// Orca machine
const mach = parseProfileJson(JSON.stringify({ type: 'machine', name: 'Bambu Lab X2D 0.4 nozzle', printer_model: 'Bambu Lab X2D', printable_area: ['0x0', '256x0', '256x256', '0x256'], printable_height: '260', nozzle_diameter: ['0.4', '0.4'], machine_max_speed_x: ['600', '600'], extruders_count: '2' }), 'm.json')
assert(mach[0].kind === 'machine' && mach[0].machine!.bed!.x === 256 && mach[0].machine!.bed!.z === 260 && mach[0].machine!.extruders === 2, 'machine')
const pr = profileToPrinter(mach[0].machine!, printerById('bambu-a1-combo'), 'p1')
assert(pr.bed.z === 260 && pr.spec.tech === 'fdm' && pr.spec.dualNozzle === true && pr.brand === 'Bambu Lab' && pr.name === 'X2D', 'machine → yazıcı')

// Bambu process
const proc = parseProfileJson(JSON.stringify({ type: 'process', name: '0.16mm Optimal @BBL X1C', layer_height: '0.16', wall_loops: '3', top_shell_layers: '5', bottom_shell_layers: '3', sparse_infill_density: '20%', enable_support: '1', support_type: 'tree(auto)', support_threshold_angle: '30', outer_wall_line_width: '0.42' }), 'p.json')
const params = profileToParams(proc[0].process!, DEFAULT_FDM_PARAMS)
assert(params.layerHeight === 0.16 && params.wallLoops === 3 && params.topBottomLayers === 4 && params.infillDensity === 0.2 && params.supports === 'on' && params.overhangThresholdDeg === 60 && params.lineWidth === 0.42, 'process → parametre')

// Project settings (3MF Metadata/project_settings.config)
const proj = parseProfileJson(JSON.stringify({ printer_settings_id: 'Bambu Lab A1 0.4 nozzle', print_settings_id: '0.20mm Standard @BBL A1', filament_settings_id: ['Bambu PLA Basic @BBL A1', 'Bambu PLA Basic @BBL A1', 'Generic PETG @BBL A1'], filament_type: ['PLA', 'PLA', 'PETG'], filament_density: ['1.26', '1.26', '1.27'], filament_max_volumetric_speed: ['21', '21', '10'], slow_down_layer_time: ['6', '6', '12'], nozzle_temperature: ['220', '220', '250'], printable_area: ['0x0', '256x0', '256x256', '0x256'], printable_height: '256', nozzle_diameter: ['0.4'], layer_height: '0.2', wall_loops: '2', sparse_infill_density: '15%', top_shell_layers: '5', bottom_shell_layers: '3' }), 'proje.3mf')
assert(proj.length === 4 && proj.filter((p) => p.kind === 'filament').length === 2 && proj.find((p) => p.name === 'Generic PETG @BBL A1')!.filament!.maxVolumetricSpeed === 10, 'proje ayarları: yazıcı + süreç + 2 benzersiz filament')

// PrusaSlicer INI
const ini = parseProfileIni(`[filament:Prusament PETG]\nfilament_density = 1.27\nfilament_cost = 29.99\nfilament_max_volumetric_speed = 8\nslowdown_below_layer_time = 20\ntemperature = 250\ninherits = *PET*\n[printer:Original Prusa MK4S]\nbed_shape = 0x0,250x0,250x210,0x210\nmax_print_height = 220\nnozzle_diameter = 0.4\n[print:0.20mm QUALITY @MK4S]\nlayer_height = 0.2\nperimeters = 2\ntop_solid_layers = 5\nbottom_solid_layers = 4\nfill_density = 15%\nsupport_material = 0\n`, 'PrusaSlicer_config_bundle.ini')
assert(ini.length === 3 && ini[0].source === 'prusa' && ini[0].filament!.minLayerTime === 20 && ini[1].machine!.bed!.y === 210 && ini[1].machine!.bed!.z === 220 && ini[2].process!.infillDensity === 0.15 && ini[2].process!.supportEnabled === false, 'prusa ini')

let threw = false
try { parseProfileJson('{"foo": 1}', 'a.json') } catch { threw = true }
assert(threw, 'bilinmeyen json → hata')
console.log(`profile: filament ${m.name} (${m.maxFlow} mm³/s, ${m.minLayerTime} s) | yazıcı ${pr.brand} ${pr.name} ${pr.bed.x}×${pr.bed.y}×${pr.bed.z} | süreç ${params.layerHeight} mm ${params.wallLoops} duvar %${params.infillDensity * 100} | proje ${proj.length} profil | ini ${ini.length} profil`)
console.log('profile: OK')
