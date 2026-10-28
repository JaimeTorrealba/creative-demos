// Tweakpane UI, replacing the original demo's hand-built HTML controls
// (InitParam in hairmesh.js). Parameter names, ranges and defaults match the
// original; each styling group has an enable toggle like the original group
// checkboxes (disabling zeroes the group's first parameter).

import { Pane } from 'tweakpane';

export function setupUI(params, handlers) {
	const pane = new Pane({ title: 'Parameters' });

	pane.addBinding(params, 'meshPreset', {
		label: 'input mesh',
		options: { Head: 'head', Plane: 'plane', Sphere: 'sphere', Box: 'box', 'Lee Perry Smith': 'leePerrySmith' },
	}).on('change', (ev) => handlers.rebuildScene(ev.value));

	pane.addBinding(params, 'showModel', { label: 'show head' }).on('change', handlers.updateVisibility);
	pane.addBinding(params, 'showHair', { label: 'show hair' }).on('change', handlers.updateVisibility);
	pane.addBinding(params, 'showHairMesh', { label: 'show hair mesh' }).on('change', handlers.updateVisibility);
	pane.addBinding(params, 'showLightDir', { label: 'show light direction' }).on('change', handlers.updateVisibility);

	pane.addBinding(params, 'hairColor', {
		label: 'hair color',
		options: { 'Std. Blond': 'std_blond' },
	}).on('change', (ev) => handlers.setHairColor(ev.value));

	// log-scale slider like the original AddParamLog (value = 10^exp, 0.1 .. 10)
	pane.addBinding(params, 'shadowsExp', {
		label: 'shadows',
		min: -1,
		max: 1,
		format: (v) => (10 ** v).toFixed(2),
	}).on('change', handlers.refresh);

	pane.addBinding(params, 'lengthVar', { label: 'length var.', min: 0, max: 1 }).on('change', handlers.refresh);

	// Adds a folder with an enable toggle that disables its bindings, like the
	// original group checkboxes. defs: [key, options, onChange?][]
	function addGroup(title, obj, defs) {
		const folder = pane.addFolder({ title, expanded: false });
		const children = [];
		folder.addBinding(obj, 'enabled').on('change', (ev) => {
			children.forEach((b) => { b.disabled = !ev.value; });
			handlers.refresh();
		});
		for (const [key, options, onChange] of defs) {
			const binding = folder.addBinding(obj, key, options);
			binding.on('change', onChange ?? handlers.refresh);
			children.push(binding);
		}
		return folder;
	}

	const expOpts = { min: -1, max: 1 };

	addGroup('Fuzz', params.fuzz, [
		['amount', { min: 0, max: 0.2 }],
		['distribution', { ...expOpts }],
		['exp', { ...expOpts, label: 'root ↔ tip' }],
	]);

	addGroup('Frizz', params.frizz, [
		['amount', { min: 0, max: 0.2 }],
		['freq', { min: 0, max: 4, label: 'frequency' }],
		['exp', { ...expOpts, label: 'root ↔ tip' }],
	]);

	addGroup('Kink', params.kink, [
		['amount', { min: 0, max: 0.2 }],
		['freqUV', { min: 0, max: 4, label: 'uv frequency' }],
		['freqW', { min: 0, max: 2, label: 'w frequency' }],
		['stretch', { min: 0, max: 1 }],
		['exp', { ...expOpts, label: 'root ↔ tip' }],
	]);

	addGroup('Clump', params.clump, [
		['percent', { min: 0, max: 1, label: 'percentage' }],
		['res', { min: 1, max: 256, step: 1, label: 'resolution' }, handlers.clumpResize],
		['size', { min: 0, max: 0.3 }],
		['noise', { min: 0, max: 1 }, handlers.clumpRedraw],
		['freq', { min: 0, max: 4, label: 'frequency' }, handlers.clumpRedraw],
		['variation', { min: 0, max: 1 }],
		['exp', { ...expOpts, label: 'root ↔ tip' }],
	]);

	addGroup('Curl', params.curl, [
		['amount', { min: 0, max: 0.2 }],
		['freq', { min: 0, max: 2, label: 'frequency' }],
		['twists', { min: 0, max: 20 }],
		['twistExp', { ...expOpts, label: 'twist ↔' }],
		['exp', { ...expOpts, label: 'root ↔ tip' }],
	]);

	const light = pane.addFolder({ title: 'Light', expanded: false });
	light.addBinding(params.light, 'autoRotate', { label: 'auto rotate' }).on('change', handlers.toggleLightSpin);
	light.addBinding(params.light, 'rotation', { min: -Math.PI, max: Math.PI }).on('change', handlers.refresh);
	light.addBinding(params.light, 'tilt', { min: -Math.PI / 2, max: Math.PI / 2 }).on('change', handlers.refresh);

	const edit = pane.addFolder({ title: 'Edit Hair Mesh', expanded: false });
	edit.addBinding(params.edit, 'enabled', { label: 'edit mode' }).on('change', handlers.toggleEdit);

	const advanced = pane.addFolder({ title: 'Advanced', expanded: false });
	advanced.addBinding(params.advanced, 'renderMode', {
		label: 'render mode',
		options: { Lines: 0, Triangles: 1 },
	}).on('change', handlers.updateVisibility);
	advanced.addBinding(params.advanced, 'hairCount', { min: 1000, max: 100000, step: 100, label: 'hair count' })
		.on('change', handlers.setHairCount);
	advanced.addBinding(params.advanced, 'hairSegs', { min: 16, max: 128, step: 16, label: 'hair segments' })
		.on('change', handlers.rebuildHair);
	advanced.addBinding(params.advanced, 'hairWidth', { min: 0, max: 10, label: 'hair width' })
		.on('change', handlers.rebuildHair);

	return pane;
}
